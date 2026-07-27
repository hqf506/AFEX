/* SUPERSEDED
DO NOT EXECUTE
AFEX Core V2 I5.9 — Package 7: Verification
Purpose: verify schema, financial replay, inventory, numbering, idempotency,
audit, outbox, snapshots and customer identity without mutation.
Objects created/modified: none.
Execution order: after each package and again after controlled activation.
Rollback: not applicable.
Risk: LOW logically; MEDIUM operationally on very large tables.
Dependencies: Packages 1–6 as relevant. Missing objects are reported.
Estimated lock impact: ACCESS SHARE only; aggregate scans may consume I/O.
*/

-- V7.1 Package object inventory.
select
  n.nspname as schema_name,
  c.relname as object_name,
  c.relkind as object_kind,
  pg_get_userbyid(c.relowner) as owner,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('financial_quotes','idempotency_commands','atomic_outbox')
order by c.relname;

select
  p.oid::regprocedure::text as function_signature,
  p.prosecdef as security_definer,
  p.proconfig as function_settings,
  pg_get_userbyid(p.proowner) as owner
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'normalize_customer_phone_v2',
    'resolve_customer_identity_v2',
    'acquire_idempotency_command_v2',
    'allocate_branch_monthly_number_v2',
    'validate_and_apply_inventory_v2',
    'enqueue_atomic_outbox_v1',
    'create_order_atomic_v2'
  )
order by p.proname, p.oid::regprocedure::text;

-- V7.2 Exact index health and definitions.
select
  c.relname as index_name,
  i.indisunique,
  i.indisvalid,
  i.indisready,
  pg_get_indexdef(i.indexrelid) as index_definition
from pg_index i
join pg_class c on c.oid = i.indexrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and (
    c.relname like 'customers_tenant_phone_normalized%'
    or c.relname like 'idempotency_commands_%'
    or c.relname like 'atomic_outbox_%'
    or c.relname like 'financial_quotes_%'
  )
order by c.relname;

-- V7.3 Constraint validation state.
select
  conrelid::regclass::text as table_name,
  conname,
  contype,
  convalidated,
  pg_get_constraintdef(oid, true) as definition
from pg_constraint
where connamespace = 'public'::regnamespace
  and (
    conname like '%_v2_%'
    or conrelid in (
      'public.financial_quotes'::regclass,
      'public.idempotency_commands'::regclass,
      'public.atomic_outbox'::regclass
    )
  )
order by table_name, conname;

-- V7.4 Customer identity truth.
select
  count(*) as customers_total,
  count(*) filter (where tenant_id is null) as missing_tenant,
  count(*) filter (where phone_normalized is null) as missing_normalized,
  count(*) filter (
    where phone_normalized is distinct from
      public.normalize_customer_phone_v2(phone)
  ) as normalization_mismatch,
  count(*) filter (where record_version is null or record_version < 1)
    as invalid_record_version
from public.customers;

select tenant_id, phone_normalized, count(*) as duplicate_count,
       array_agg(id order by created_at, id) as customer_ids
from public.customers
group by tenant_id, phone_normalized
having count(*) > 1
order by duplicate_count desc, tenant_id, phone_normalized;

-- The global raw phone key must be absent after activation.
select conname, pg_get_constraintdef(oid, true) as definition
from pg_constraint
where conrelid = 'public.customers'::regclass
  and conname = 'customers_phone_key';

-- V7.5 Idempotency identity, replay and state invariants.
select tenant_id, branch_id, command_type, key_hash, count(*) as row_count
from public.idempotency_commands
group by tenant_id, branch_id, command_type, key_hash
having count(*) > 1
order by row_count desc;

select
  count(*) filter (where state = 'committed') as committed,
  count(*) filter (
    where state = 'committed'
      and (order_id is null or invoice_id is null
           or response_version is null or response_hash is null)
  ) as invalid_committed,
  count(*) filter (
    where state = 'started'
      and lease_expires_at < clock_timestamp()
  ) as recoverable_started,
  count(*) filter (
    where response_hash is not null
      and response_hash !~ '^[0-9a-f]{64}$'
  ) as invalid_response_hash
from public.idempotency_commands;

select
  i.id as command_id,
  i.state,
  i.order_id,
  o.id is not null as order_exists,
  i.invoice_id,
  inv.id is not null as invoice_exists,
  i.response_version,
  i.response_hash
from public.idempotency_commands i
left join public.orders o on o.id = i.order_id
left join public.invoices inv on inv.id = i.invoice_id
where i.state = 'committed'
  and (o.id is null or inv.id is null)
order by i.committed_at, i.id;

-- V7.6 Financial replay completeness without mutable catalog/VAT lookups.
select
  i.id as invoice_id,
  i.invoice_number,
  i.financial_snapshot_version,
  i.financial_snapshot_hash,
  i.financial_snapshot_complete,
  i.quote_fingerprint,
  count(ii.id) as item_count,
  bool_and(
    ii.item_name_snapshot is not null
    and ii.item_type_snapshot is not null
    and ii.quantity > 0
    and ii.unit_price is not null
    and ii.line_total is not null
    and ii.pricing_snapshot is not null
  ) as line_snapshots_complete,
  sum(ii.line_total) as replay_line_total,
  i.subtotal,
  i.discount,
  i.tax,
  i.total
from public.invoices i
left join public.invoice_items ii on ii.invoice_id = i.id
where i.atomic_engine_version = 'atomic-order-v2-r1'
group by i.id
order by i.created_at desc, i.id;

select
  fq.id as quote_id,
  fq.quote_fingerprint,
  fq.quote_hash,
  fq.expires_at,
  i.id as committed_invoice_id,
  i.financial_snapshot_hash,
  (i.financial_snapshot_hash = fq.quote_hash) as hash_matches
from public.financial_quotes fq
left join public.invoices i on i.financial_quote_id = fq.id
where i.id is not null
order by i.created_at desc;

-- V7.7 Inventory replay and conservation checks.
select
  count(*) filter (where quantity_on_hand < 0) as negative_stock_rows,
  count(*) filter (where record_version is null or record_version < 1)
    as invalid_stock_versions
from public.inventory_stock;

select
  im.invoice_id,
  im.catalog_item_id,
  sum(im.quantity_delta) as movement_delta,
  min(im.quantity_before) as earliest_before,
  max(im.quantity_after) as latest_after,
  bool_and(
    im.quantity_after = im.quantity_before + im.quantity_delta
  ) as every_movement_balances,
  count(*) as movement_count
from public.inventory_movements im
where im.inventory_engine_version = 'atomic-order-v2-r1'
group by im.invoice_id, im.catalog_item_id
order by im.invoice_id, im.catalog_item_id;

select im.id, im.invoice_id, im.order_id, im.catalog_item_id
from public.inventory_movements im
left join public.invoices i on i.id = im.invoice_id
left join public.orders o on o.id = im.order_id
where im.inventory_engine_version = 'atomic-order-v2-r1'
  and ((im.invoice_id is not null and i.id is null)
    or (im.order_id is not null and o.id is null))
order by im.id;

-- V7.8 Numbering uniqueness and sequence position.
select tenant_id, branch_id, order_sequence_month, order_number, count(*) as uses
from public.orders
group by tenant_id, branch_id, order_sequence_month, order_number
having count(*) > 1
order by uses desc;

select
  s.tenant_id,
  s.branch_id,
  s.sequence_month,
  s.last_sequence,
  coalesce(max(
    case
      when o.order_number ~ '^[^-]+-[0-9]+$'
      then substring(o.order_number from '[0-9]+$')::integer
    end
  ), 0) as highest_persisted_suffix,
  s.last_sequence >= coalesce(max(
    case
      when o.order_number ~ '^[^-]+-[0-9]+$'
      then substring(o.order_number from '[0-9]+$')::integer
    end
  ), 0) as sequence_not_behind
from public.order_number_sequences s
left join public.orders o
  on o.tenant_id = s.tenant_id
 and o.branch_id = s.branch_id
 and o.order_sequence_month = s.sequence_month
group by s.tenant_id, s.branch_id, s.sequence_month, s.last_sequence
order by s.tenant_id, s.branch_id, s.sequence_month;

-- V7.9 Atomic audit coverage.
select
  o.id as order_id,
  o.correlation_id,
  count(a.id) as audit_count
from public.orders o
left join public.audit_logs a
  on a.order_id = o.id
 and a.correlation_id = o.correlation_id
where o.atomic_engine_version = 'atomic-order-v2-r1'
group by o.id
having count(a.id) = 0
order by o.created_at, o.id;

-- V7.10 Outbox hash, lifecycle and aggregate references.
select
  execution_status,
  count(*) as event_count,
  count(*) filter (
    where payload_hash <>
      encode(extensions.digest(payload::text, 'sha256'), 'hex')
  ) as hash_mismatch,
  count(*) filter (
    where execution_status = 'processing'
      and lease_expires_at < clock_timestamp()
  ) as expired_processing_leases
from public.atomic_outbox
group by execution_status
order by execution_status;

select ao.id, ao.event_id, ao.aggregate_type, ao.aggregate_id
from public.atomic_outbox ao
left join public.orders o
  on ao.aggregate_type = 'order' and o.id = ao.aggregate_id
left join public.invoices i
  on ao.aggregate_type = 'invoice' and i.id = ao.aggregate_id
left join public.customers c
  on ao.aggregate_type = 'customer' and c.id = ao.aggregate_id
where (ao.aggregate_type = 'order' and o.id is null)
   or (ao.aggregate_type = 'invoice' and i.id is null)
   or (ao.aggregate_type = 'customer' and c.id is null)
order by ao.created_at, ao.id;

-- V7.11 Trigger coexistence definitions.
select
  t.tgname,
  t.tgrelid::regclass::text as table_name,
  p.oid::regprocedure::text as function_signature,
  pg_get_triggerdef(t.oid, true) as trigger_definition
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where not t.tgisinternal
  and t.tgname in (
    'trg_zzzz_set_order_number_branch_monthly',
    'trg_deduct_inventory_on_invoice_item_insert'
  )
order by table_name, t.tgname;

-- V7.12 Effective execution privileges: browser must be false, service true.
select
  r.rolname,
  has_function_privilege(
    r.rolname,
    'public.create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ) as can_execute_atomic_v2,
  has_function_privilege(
    r.rolname,
    'public.create_invoice_with_items_safe(text,text,text,text,numeric,numeric,text,jsonb,text,uuid,uuid,uuid)',
    'EXECUTE'
  ) as can_execute_legacy
from pg_roles r
where r.rolname in ('anon','authenticated','service_role')
order by r.rolname;

-- V7.13 Compact release gate. Every blocker must be zero.
select 'customer_missing_tenant' as gate, count(*)::bigint as blockers
from public.customers where tenant_id is null
union all
select 'customer_identity_invalid', count(*)
from public.customers
where phone_normalized is null
   or phone_normalized is distinct from public.normalize_customer_phone_v2(phone)
union all
select 'customer_identity_duplicate', count(*)
from (
  select 1 from public.customers
  group by tenant_id, phone_normalized having count(*) > 1
) d
union all
select 'inventory_negative', count(*)
from public.inventory_stock where quantity_on_hand < 0
union all
select 'committed_idempotency_incomplete', count(*)
from public.idempotency_commands
where state = 'committed'
  and (order_id is null or invoice_id is null or response_hash is null)
union all
select 'atomic_invoice_snapshot_incomplete', count(*)
from public.invoices
where atomic_engine_version = 'atomic-order-v2-r1'
  and (
    financial_snapshot_complete is distinct from true
    or financial_snapshot_hash is null
    or payment_snapshot is null
  )
union all
select 'outbox_payload_hash_mismatch', count(*)
from public.atomic_outbox
where payload_hash <>
  encode(extensions.digest(payload::text, 'sha256'), 'hex')
order by gate;
