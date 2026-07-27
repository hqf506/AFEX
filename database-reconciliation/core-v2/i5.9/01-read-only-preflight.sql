/*
AFEX Core V2 I5.9 — Package 1R: Hardened Read-only Preflight
Purpose: inspect Production readiness without changing data or schema.
Objects created/modified: none.
Execution order: run first and export every result set for restricted review.
Rollback: not applicable; this package is strictly read-only.
Risk: LOW for state; potentially MEDIUM for I/O on large relations.
Dependencies: PostgreSQL 17 and the canonical Production public schema only.
Estimated lock impact: ACCESS SHARE; long scans can delay concurrent DDL.
Privacy: result sets marked RESTRICTED contain customer or operational evidence.
*/

-- P1.1 Safe server and schema identity. Operational database/user identity is
-- intentionally omitted from the default export.
select
  current_setting('server_version') as postgres_version,
  'public'::text as inspected_schema,
  clock_timestamp() as captured_at;

select
  required.object_type,
  required.object_name,
  case
    when required.object_type = 'table'
      then to_regclass('public.' || required.object_name) is not null
    when required.object_type = 'function'
      then to_regprocedure(required.object_name) is not null
    else false
  end as exists
from (
  values
    ('table', 'tenants'),
    ('table', 'profiles'),
    ('table', 'pos_profiles'),
    ('table', 'branches'),
    ('table', 'customers'),
    ('table', 'catalog_items'),
    ('table', 'branch_catalog_items'),
    ('table', 'vat_settings'),
    ('table', 'discounts'),
    ('table', 'orders'),
    ('table', 'invoices'),
    ('table', 'invoice_items'),
    ('table', 'inventory_stock'),
    ('table', 'inventory_movements'),
    ('table', 'order_number_sequences'),
    ('table', 'audit_logs'),
    ('function', 'public.create_invoice_with_items_safe(text,text,text,text,numeric,numeric,text,jsonb,text,uuid,uuid,uuid)'),
    ('function', 'public.next_branch_monthly_order_number(uuid,uuid,timestamp with time zone)')
) as required(object_type, object_name)
order by required.object_type, required.object_name;

-- P1.2 Exact baseline column inventory and future-column presence.
select
  c.table_name,
  c.ordinal_position,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default,
  c.is_generated,
  c.generation_expression
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name in (
    'customers',
    'orders',
    'invoices',
    'invoice_items',
    'inventory_stock',
    'inventory_movements',
    'order_number_sequences',
    'audit_logs'
  )
order by c.table_name, c.ordinal_position;

select
  expected.table_name,
  expected.column_name,
  expected.frozen_purpose,
  (c.column_name is not null) as currently_exists,
  c.data_type,
  c.is_nullable
from (
  values
    ('customers', 'phone_normalized', 'tenant-aware customer identity'),
    ('customers', 'record_version', 'optimistic concurrency'),
    ('orders', 'idempotency_command_id', 'idempotency reference'),
    ('orders', 'correlation_id', 'transaction correlation'),
    ('orders', 'atomic_engine_version', 'creation-generation marker'),
    ('orders', 'customer_name_snapshot', 'customer evidence'),
    ('orders', 'customer_phone_snapshot', 'customer evidence'),
    ('invoices', 'financial_quote_id', 'advisory quote reference'),
    ('invoices', 'financial_snapshot_version', 'financial replay'),
    ('invoices', 'financial_snapshot_hash', 'financial replay'),
    ('invoices', 'financial_snapshot_complete', 'snapshot completeness'),
    ('invoices', 'payment_snapshot', 'payment replay'),
    ('invoices', 'atomic_engine_version', 'creation-generation marker'),
    ('invoice_items', 'pricing_snapshot', 'line financial replay'),
    ('invoice_items', 'inventory_snapshot_version', 'inventory replay'),
    ('inventory_stock', 'record_version', 'inventory concurrency'),
    ('inventory_movements', 'order_id', 'direct order evidence'),
    ('inventory_movements', 'invoice_id', 'direct invoice evidence'),
    ('inventory_movements', 'invoice_item_id', 'direct line evidence'),
    ('inventory_movements', 'inventory_engine_version', 'movement generation')
) as expected(table_name, column_name, frozen_purpose)
left join information_schema.columns c
  on c.table_schema = 'public'
 and c.table_name = expected.table_name
 and c.column_name = expected.column_name
order by expected.table_name, expected.column_name;

-- P1.3 Existing constraints, indexes, triggers, RLS and grants.
select
  con.conrelid::regclass::text as object_name,
  con.conname as constraint_name,
  con.contype as constraint_type,
  con.convalidated,
  pg_get_constraintdef(con.oid, true) as definition
from pg_catalog.pg_constraint con
where con.connamespace = 'public'::regnamespace
  and con.conrelid in (
    'public.customers'::regclass,
    'public.orders'::regclass,
    'public.invoices'::regclass,
    'public.invoice_items'::regclass,
    'public.inventory_stock'::regclass,
    'public.inventory_movements'::regclass,
    'public.order_number_sequences'::regclass,
    'public.audit_logs'::regclass
  )
order by object_name, constraint_name;

select schemaname, tablename, indexname, indexdef
from pg_catalog.pg_indexes
where schemaname = 'public'
  and tablename in (
    'customers', 'orders', 'invoices', 'invoice_items',
    'inventory_stock', 'inventory_movements',
    'order_number_sequences', 'audit_logs'
  )
order by tablename, indexname;

select
  event_object_table as table_name,
  trigger_name,
  action_timing,
  event_manipulation,
  action_statement
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table in (
    'customers', 'orders', 'invoices', 'invoice_items',
    'inventory_stock', 'inventory_movements'
  )
order by event_object_table, trigger_name, event_manipulation;

select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'customers', 'orders', 'invoices', 'invoice_items',
    'inventory_stock', 'inventory_movements',
    'order_number_sequences', 'audit_logs'
  )
order by c.relname;

select
  grantee,
  table_name,
  string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'customers', 'orders', 'invoices', 'invoice_items',
    'inventory_stock', 'inventory_movements',
    'order_number_sequences', 'audit_logs'
  )
group by grantee, table_name
order by table_name, grantee;

-- P1.4 Customer normalization diagnostics.
-- Likely full scan. The expression is calculated once in this statement.
with normalized as (
  select
    c.id,
    c.tenant_id,
    c.branch_id,
    c.phone,
    case
      when compact_phone ~ '^05[0-9]{8}$'
        then '966' || substring(compact_phone from 2)
      when compact_phone ~ '^5[0-9]{8}$'
        then '966' || compact_phone
      when compact_phone ~ '^\+9665[0-9]{8}$'
        then substring(compact_phone from 2)
      when compact_phone ~ '^9665[0-9]{8}$'
        then compact_phone
      else null
    end as phone_normalized_candidate
  from public.customers c
  cross join lateral (
    select regexp_replace(
      translate(
        coalesce(c.phone, ''),
        '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
        '01234567890123456789'
      ),
      '[\s\-\(\)]',
      '',
      'g'
    ) as compact_phone
  ) formatted
),
duplicate_identities as (
  select tenant_id, phone_normalized_candidate
  from normalized
  where tenant_id is not null and phone_normalized_candidate is not null
  group by tenant_id, phone_normalized_candidate
  having count(*) > 1
),
classified as (
  select
    n.*,
    case
      when n.tenant_id is null then 'missing_tenant'
      when nullif(btrim(coalesce(n.phone, '')), '') is null then 'empty'
      when n.phone_normalized_candidate is null then 'invalid_format'
      when d.phone_normalized_candidate is not null
        then 'duplicate_within_tenant'
      else 'valid_supported'
    end as identity_classification
  from normalized n
  left join duplicate_identities d
    on d.tenant_id = n.tenant_id
   and d.phone_normalized_candidate = n.phone_normalized_candidate
)
select
  identity_classification,
  count(*) as customer_count
from classified
group by identity_classification
order by identity_classification;

-- RESTRICTED ADMINISTRATIVE EVIDENCE: raw phone values are included only for
-- manual correction. Do not publish or expose this result to tenant clients.
with normalized as (
  select
    c.id,
    c.tenant_id,
    c.phone,
    case
      when compact_phone ~ '^05[0-9]{8}$'
        then '966' || substring(compact_phone from 2)
      when compact_phone ~ '^5[0-9]{8}$'
        then '966' || compact_phone
      when compact_phone ~ '^\+9665[0-9]{8}$'
        then substring(compact_phone from 2)
      when compact_phone ~ '^9665[0-9]{8}$'
        then compact_phone
      else null
    end as phone_normalized_candidate
  from public.customers c
  cross join lateral (
    select regexp_replace(
      translate(
        coalesce(c.phone, ''),
        '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
        '01234567890123456789'
      ),
      '[\s\-\(\)]',
      '',
      'g'
    ) as compact_phone
  ) formatted
)
select
  'RESTRICTED_ADMIN_EVIDENCE'::text as evidence_class,
  id,
  tenant_id,
  phone,
  phone_normalized_candidate,
  case
    when tenant_id is null then 'missing_tenant'
    when nullif(btrim(coalesce(phone, '')), '') is null then 'empty'
    else 'invalid_format'
  end as identity_classification
from normalized
where tenant_id is null
   or nullif(btrim(coalesce(phone, '')), '') is null
   or phone_normalized_candidate is null
order by tenant_id nulls first, id;

-- RESTRICTED ADMINISTRATIVE EVIDENCE: same-tenant duplicate groups only.
with normalized as (
  select
    c.id,
    c.tenant_id,
    case
      when compact_phone ~ '^05[0-9]{8}$'
        then '966' || substring(compact_phone from 2)
      when compact_phone ~ '^5[0-9]{8}$'
        then '966' || compact_phone
      when compact_phone ~ '^\+9665[0-9]{8}$'
        then substring(compact_phone from 2)
      when compact_phone ~ '^9665[0-9]{8}$'
        then compact_phone
      else null
    end as phone_normalized_candidate
  from public.customers c
  cross join lateral (
    select regexp_replace(
      translate(
        coalesce(c.phone, ''),
        '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
        '01234567890123456789'
      ),
      '[\s\-\(\)]',
      '',
      'g'
    ) as compact_phone
  ) formatted
)
select
  'RESTRICTED_ADMIN_EVIDENCE'::text as evidence_class,
  tenant_id,
  phone_normalized_candidate,
  count(*) as duplicate_count,
  array_agg(id order by id) as customer_ids
from normalized
where tenant_id is not null
  and phone_normalized_candidate is not null
group by tenant_id, phone_normalized_candidate
having count(*) > 1
order by tenant_id, phone_normalized_candidate;

-- P1.5 Complete tenant, branch, parent and catalog scope diagnostics.
-- These checks detect mismatches even when every referenced ID exists.
select 'customers_missing_tenant' as issue, c.id as row_id
from public.customers c where c.tenant_id is null
union all
select 'orders_missing_tenant', o.id
from public.orders o where o.tenant_id is null
union all
select 'invoices_missing_tenant', i.id
from public.invoices i where i.tenant_id is null
union all
select 'invoice_items_missing_tenant', ii.id
from public.invoice_items ii where ii.tenant_id is null
order by issue, row_id;

select
  issue,
  row_id,
  row_tenant_id,
  referenced_tenant_id,
  row_branch_id,
  referenced_branch_id
from (
  select
    'customer_branch_scope_mismatch'::text as issue,
    c.id as row_id,
    c.tenant_id as row_tenant_id,
    b.tenant_id as referenced_tenant_id,
    c.branch_id as row_branch_id,
    b.id as referenced_branch_id
  from public.customers c
  join public.branches b on b.id = c.branch_id
  where c.tenant_id is distinct from b.tenant_id

  union all
  select
    'order_branch_scope_mismatch',
    o.id, o.tenant_id, b.tenant_id, o.branch_id, b.id
  from public.orders o
  join public.branches b on b.id = o.branch_id
  where o.tenant_id is distinct from b.tenant_id

  union all
  select
    'invoice_branch_scope_mismatch',
    i.id, i.tenant_id, b.tenant_id, i.branch_id, b.id
  from public.invoices i
  join public.branches b on b.id = i.branch_id
  where i.tenant_id is distinct from b.tenant_id

  union all
  select
    'order_customer_tenant_mismatch',
    o.id, o.tenant_id, c.tenant_id, o.branch_id, c.branch_id
  from public.orders o
  join public.customers c on c.id = o.customer_id
  where o.tenant_id is distinct from c.tenant_id

  union all
  select
    'order_customer_branch_mismatch',
    o.id, o.tenant_id, c.tenant_id, o.branch_id, c.branch_id
  from public.orders o
  join public.customers c on c.id = o.customer_id
  where o.branch_id is not null
    and c.branch_id is not null
    and o.branch_id is distinct from c.branch_id

  union all
  select
    'invoice_order_scope_mismatch',
    i.id, i.tenant_id, o.tenant_id, i.branch_id, o.branch_id
  from public.invoices i
  join public.orders o on o.id = i.order_id
  where i.tenant_id is distinct from o.tenant_id
     or i.branch_id is distinct from o.branch_id

  union all
  select
    'invoice_customer_tenant_mismatch',
    i.id, i.tenant_id, c.tenant_id, i.branch_id, c.branch_id
  from public.invoices i
  join public.customers c on c.id = i.customer_id
  where i.tenant_id is distinct from c.tenant_id

  union all
  select
    'invoice_item_invoice_tenant_mismatch',
    ii.id, ii.tenant_id, i.tenant_id, i.branch_id, i.branch_id
  from public.invoice_items ii
  join public.invoices i on i.id = ii.invoice_id
  where ii.tenant_id is distinct from i.tenant_id

  union all
  select
    'invoice_item_catalog_tenant_mismatch',
    ii.id, ii.tenant_id, ci.tenant_id, i.branch_id, null::uuid
  from public.invoice_items ii
  join public.invoices i on i.id = ii.invoice_id
  join public.catalog_items ci on ci.id = ii.item_id
  where ii.tenant_id is distinct from ci.tenant_id
     or i.tenant_id is distinct from ci.tenant_id
) findings
order by issue, row_id;

select
  'invoice_customer_differs_from_order' as issue,
  i.id as row_id,
  i.customer_id as invoice_customer_id,
  o.customer_id as order_customer_id
from public.invoices i
join public.orders o on o.id = i.order_id
where i.customer_id is distinct from o.customer_id
order by i.id;

select 'orders_without_customer' as issue, o.id as row_id
from public.orders o
left join public.customers c on c.id = o.customer_id
where c.id is null
union all
select 'invoices_without_order', i.id
from public.invoices i
left join public.orders o on o.id = i.order_id
where o.id is null
union all
select 'invoices_without_customer', i.id
from public.invoices i
left join public.customers c on c.id = i.customer_id
where c.id is null
union all
select 'invoice_items_without_invoice', ii.id
from public.invoice_items ii
left join public.invoices i on i.id = ii.invoice_id
where i.id is null
union all
select 'invoice_items_without_catalog', ii.id
from public.invoice_items ii
left join public.catalog_items ci on ci.id = ii.item_id
where ii.item_id is not null and ci.id is null
union all
select 'inventory_stock_without_branch', s.id
from public.inventory_stock s
left join public.branches b on b.id = s.branch_id
where b.id is null
union all
select 'inventory_stock_without_catalog', s.id
from public.inventory_stock s
left join public.catalog_items ci on ci.id = s.catalog_item_id
where ci.id is null
order by issue, row_id;

-- P1.6 Numbering hardening.
-- Likely full scans/grouping of orders and invoices.
select
  b.tenant_id,
  b.id as branch_id,
  b.order_number_prefix,
  case
    when b.order_number_prefix ~ '^[0-9]{2}$' then 'valid'
    when b.order_number_prefix is null then 'missing'
    else 'invalid'
  end as prefix_status
from public.branches b
where b.deleted_at is null
order by b.tenant_id, b.id;

select
  b.tenant_id,
  b.order_number_prefix,
  count(*) as branch_count,
  array_agg(b.id order by b.id) as branch_ids
from public.branches b
where b.order_number_prefix is not null
group by b.tenant_id, b.order_number_prefix
having count(*) > 1
order by b.tenant_id, b.order_number_prefix;

select
  'order_number_invalid_format_or_prefix' as issue,
  o.id as row_id,
  o.tenant_id,
  o.branch_id,
  o.order_number,
  b.order_number_prefix
from public.orders o
left join public.branches b on b.id = o.branch_id
where b.id is null
   or b.order_number_prefix is null
   or o.order_number !~ ('^' || b.order_number_prefix || '-[0-9]+$')
union all
select
  'invoice_number_invalid_format_or_prefix',
  i.id,
  i.tenant_id,
  i.branch_id,
  i.invoice_number,
  b.order_number_prefix
from public.invoices i
left join public.branches b on b.id = i.branch_id
where b.id is null
   or b.order_number_prefix is null
   or i.invoice_number !~ ('^' || b.order_number_prefix || '-[0-9]+$')
order by issue, row_id;

select
  'order_sequence_month_timestamp_mismatch' as issue,
  o.id as row_id,
  o.order_sequence_month as stored_month,
  date_trunc('month', o.created_at at time zone 'UTC')::date as expected_month
from public.orders o
where o.order_sequence_month is distinct from
  date_trunc('month', o.created_at at time zone 'UTC')::date
order by o.id;

select
  'sequence_missing_tenant' as issue,
  ons.tenant_id,
  ons.branch_id,
  ons.sequence_month
from public.order_number_sequences ons
left join public.tenants t on t.id = ons.tenant_id
where t.id is null
union all
select
  'sequence_missing_branch',
  ons.tenant_id,
  ons.branch_id,
  ons.sequence_month
from public.order_number_sequences ons
left join public.branches b on b.id = ons.branch_id
where b.id is null
union all
select
  'sequence_branch_tenant_mismatch',
  ons.tenant_id,
  ons.branch_id,
  ons.sequence_month
from public.order_number_sequences ons
join public.branches b on b.id = ons.branch_id
where ons.tenant_id is distinct from b.tenant_id
union all
select
  'sequence_month_not_normalized',
  ons.tenant_id,
  ons.branch_id,
  ons.sequence_month
from public.order_number_sequences ons
where ons.sequence_month is null
   or ons.sequence_month is distinct from
      date_trunc('month', ons.sequence_month)::date
order by issue, tenant_id, branch_id, sequence_month;

select
  o.tenant_id,
  o.branch_id,
  o.order_sequence_month,
  o.order_number,
  count(*) as duplicate_count,
  array_agg(o.id order by o.id) as order_ids
from public.orders o
group by o.tenant_id, o.branch_id, o.order_sequence_month, o.order_number
having count(*) > 1
order by o.tenant_id, o.branch_id, o.order_sequence_month, o.order_number;

select
  i.tenant_id,
  i.branch_id,
  i.invoice_sequence_month,
  i.invoice_number,
  count(*) as duplicate_count,
  array_agg(i.id order by i.id) as invoice_ids
from public.invoices i
group by i.tenant_id, i.branch_id, i.invoice_sequence_month, i.invoice_number
having count(*) > 1
order by i.tenant_id, i.branch_id, i.invoice_sequence_month, i.invoice_number;

select
  i.id as invoice_id,
  i.invoice_number,
  o.id as order_id,
  o.order_number
from public.invoices i
join public.orders o on o.id = i.order_id
where i.invoice_number is distinct from o.order_number
order by i.id;

-- Aggregate orders once, then join sequence rows. Avoids a correlated scan per
-- sequence identity.
with order_maxima as (
  select
    o.tenant_id,
    o.branch_id,
    o.order_sequence_month as sequence_month,
    max(
      case
        when b.order_number_prefix is not null
         and o.order_number ~ ('^' || b.order_number_prefix || '-[0-9]+$')
          then substring(o.order_number from '[0-9]+$')::integer
        else null
      end
    ) as highest_existing_sequence
  from public.orders o
  left join public.branches b on b.id = o.branch_id
  group by o.tenant_id, o.branch_id, o.order_sequence_month
)
select
  ons.tenant_id,
  ons.branch_id,
  ons.sequence_month,
  ons.last_sequence,
  coalesce(om.highest_existing_sequence, 0) as highest_existing_sequence,
  case
    when ons.last_sequence < coalesce(om.highest_existing_sequence, 0)
      then 'sequence_behind'
    else 'ok'
  end as sequence_status
from public.order_number_sequences ons
left join order_maxima om
  on om.tenant_id = ons.tenant_id
 and om.branch_id = ons.branch_id
 and om.sequence_month = ons.sequence_month
order by ons.tenant_id, ons.branch_id, ons.sequence_month;

-- Semantically equivalent indexes with different names.
with normalized_indexes as (
  select
    i.indrelid::regclass::text as table_name,
    c.relname as index_name,
    pg_get_indexdef(i.indexrelid) as index_definition,
    lower(
      regexp_replace(
        regexp_replace(
          pg_get_indexdef(i.indexrelid),
          '^CREATE( UNIQUE)? INDEX [^ ]+ ON ',
          'CREATE\1 INDEX ON ',
          'i'
        ),
        '\s+',
        ' ',
        'g'
      )
    ) as normalized_definition
  from pg_catalog.pg_index i
  join pg_catalog.pg_class c on c.oid = i.indexrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and i.indrelid in (
      'public.orders'::regclass,
      'public.invoices'::regclass,
      'public.order_number_sequences'::regclass
    )
)
select
  table_name,
  normalized_definition,
  count(*) as equivalent_index_count,
  array_agg(index_name order by index_name) as index_names,
  array_agg(index_definition order by index_name) as index_definitions
from normalized_indexes
group by table_name, normalized_definition
having count(*) > 1
order by table_name, normalized_definition;

-- P1.7 Complete inventory and movement consistency.
-- Stock identities are checked set-wise without branch × catalog expansion.
select
  s.id,
  s.tenant_id,
  s.branch_id,
  s.catalog_item_id,
  s.quantity_on_hand,
  ci.tenant_id as catalog_tenant_id,
  b.tenant_id as branch_tenant_id,
  case
    when s.quantity_on_hand < 0 then 'negative_quantity'
    when b.id is null then 'missing_branch'
    when ci.id is null then 'missing_catalog_item'
    when s.tenant_id is distinct from b.tenant_id
      then 'branch_tenant_mismatch'
    when s.tenant_id is distinct from ci.tenant_id
      then 'catalog_tenant_mismatch'
    else 'unknown'
  end as inventory_issue
from public.inventory_stock s
left join public.catalog_items ci on ci.id = s.catalog_item_id
left join public.branches b on b.id = s.branch_id
where s.quantity_on_hand < 0
   or ci.id is null
   or b.id is null
   or s.tenant_id is distinct from ci.tenant_id
   or s.tenant_id is distinct from b.tenant_id
order by s.tenant_id, s.branch_id, s.catalog_item_id;

select
  s.tenant_id,
  s.branch_id,
  s.catalog_item_id,
  count(*) as stock_row_count,
  array_agg(s.id order by s.id) as stock_row_ids
from public.inventory_stock s
group by s.tenant_id, s.branch_id, s.catalog_item_id
having count(*) > 1
order by s.tenant_id, s.branch_id, s.catalog_item_id;

-- Missing stock is limited to active tracked products and active branches.
-- This can still be large, but avoids inactive/deleted branch × catalog rows.
select
  ci.tenant_id,
  b.id as branch_id,
  ci.id as catalog_item_id
from public.catalog_items ci
join public.branches b
  on b.tenant_id = ci.tenant_id
 and b.is_active = true
 and b.deleted_at is null
left join public.inventory_stock s
  on s.tenant_id = ci.tenant_id
 and s.branch_id = b.id
 and s.catalog_item_id = ci.id
where ci.item_type = 'product'
  and ci.track_inventory = true
  and ci.is_active = true
  and ci.deleted_at is null
  and s.id is null
order by ci.tenant_id, b.id, ci.id;

/*
Movement references use current legacy source_type/source_id and, if Package 2
was independently installed, safely inspect future IDs through to_jsonb.
No future column is referenced directly.
*/
with movement_refs as (
  select
    m.*,
    case
      when coalesce(to_jsonb(m)->>'order_id', '') ~
           '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
        then (to_jsonb(m)->>'order_id')::uuid
      when m.source_type = 'order' then m.source_id
      else null
    end as resolved_order_id,
    case
      when coalesce(to_jsonb(m)->>'invoice_id', '') ~
           '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
        then (to_jsonb(m)->>'invoice_id')::uuid
      when m.source_type = 'invoice' then m.source_id
      else null
    end as resolved_invoice_id,
    case
      when coalesce(to_jsonb(m)->>'invoice_item_id', '') ~
           '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
        then (to_jsonb(m)->>'invoice_item_id')::uuid
      when m.source_type = 'invoice_item' then m.source_id
      else null
    end as resolved_invoice_item_id
  from public.inventory_movements m
),
resolved as (
  select
    mr.*,
    b.tenant_id as branch_tenant_id,
    ci.tenant_id as catalog_tenant_id,
    o.id as found_order_id,
    o.tenant_id as order_tenant_id,
    o.branch_id as order_branch_id,
    i.id as found_invoice_id,
    i.order_id as invoice_order_id,
    i.tenant_id as invoice_tenant_id,
    i.branch_id as invoice_branch_id,
    ii.id as found_invoice_item_id,
    ii.invoice_id as item_invoice_id,
    ii.tenant_id as item_tenant_id,
    parent_i.tenant_id as item_parent_invoice_tenant_id,
    parent_i.branch_id as item_parent_invoice_branch_id,
    parent_i.order_id as item_parent_order_id
  from movement_refs mr
  left join public.branches b on b.id = mr.branch_id
  left join public.catalog_items ci on ci.id = mr.catalog_item_id
  left join public.orders o on o.id = mr.resolved_order_id
  left join public.invoices i on i.id = mr.resolved_invoice_id
  left join public.invoice_items ii on ii.id = mr.resolved_invoice_item_id
  left join public.invoices parent_i on parent_i.id = ii.invoice_id
)
select
  r.id as movement_id,
  r.tenant_id,
  r.branch_id,
  r.catalog_item_id,
  r.movement_type,
  r.quantity_delta,
  r.source_type,
  r.source_id,
  r.resolved_order_id,
  r.resolved_invoice_id,
  r.resolved_invoice_item_id,
  issue.issue
from resolved r
cross join lateral (
  select unnest(array_remove(array[
    case when r.branch_tenant_id is null then 'missing_branch' end,
    case when r.catalog_tenant_id is null then 'missing_catalog_item' end,
    case when r.resolved_order_id is not null and r.found_order_id is null
      then 'missing_order' end,
    case when r.resolved_invoice_id is not null and r.found_invoice_id is null
      then 'missing_invoice' end,
    case when r.resolved_invoice_item_id is not null
               and r.found_invoice_item_id is null
      then 'missing_invoice_item' end,
    case when r.tenant_id is distinct from r.branch_tenant_id
      then 'movement_branch_tenant_mismatch' end,
    case when r.tenant_id is distinct from r.catalog_tenant_id
      then 'movement_catalog_tenant_mismatch' end,
    case when r.found_order_id is not null
               and (r.tenant_id is distinct from r.order_tenant_id
                 or r.branch_id is distinct from r.order_branch_id)
      then 'movement_order_scope_mismatch' end,
    case when r.found_invoice_id is not null
               and (r.tenant_id is distinct from r.invoice_tenant_id
                 or r.branch_id is distinct from r.invoice_branch_id)
      then 'movement_invoice_scope_mismatch' end,
    case when r.found_invoice_item_id is not null
               and r.tenant_id is distinct from r.item_tenant_id
      then 'movement_invoice_item_tenant_mismatch' end,
    case when r.found_invoice_item_id is not null
               and (
                 r.item_parent_invoice_tenant_id is null
                 or r.tenant_id is distinct from r.item_parent_invoice_tenant_id
                 or r.branch_id is distinct from r.item_parent_invoice_branch_id
               )
      then 'invoice_item_parent_scope_mismatch' end,
    case when r.found_invoice_item_id is not null
               and r.found_invoice_id is not null
               and r.item_invoice_id is distinct from r.found_invoice_id
      then 'invoice_item_does_not_belong_to_invoice' end,
    case when r.found_invoice_id is not null
               and r.found_order_id is not null
               and r.invoice_order_id is distinct from r.found_order_id
      then 'invoice_does_not_belong_to_order' end,
    case when r.found_invoice_item_id is not null
               and r.found_order_id is not null
               and r.item_parent_order_id is distinct from r.found_order_id
      then 'invoice_item_parent_does_not_belong_to_order' end,
    case when r.quantity_delta = 0 then 'zero_quantity_movement' end,
    case when r.movement_type in ('sale', 'transfer_out')
               and r.quantity_delta >= 0
      then 'outbound_movement_not_negative' end,
    case when r.movement_type in ('purchase_receive', 'sale_void', 'transfer_in')
               and r.quantity_delta <= 0
      then 'inbound_movement_not_positive' end,
    case when r.movement_type = 'sale'
               and r.resolved_invoice_id is null
               and r.resolved_invoice_item_id is null
      then 'sale_without_invoice_evidence' end
  ]::text[], null)) as issue
) issue
order by r.id, issue.issue;

-- P1.8 Snapshot readiness classification.
-- Future fields are read through to_jsonb only; absent Package 2 columns safely
-- produce missing keys instead of parse-time column errors.
select
  'customers'::text as object_type,
  readiness,
  count(*) as row_count
from (
  select
    case
      when c.tenant_id is null
        or nullif(btrim(coalesce(c.phone, '')), '') is null
        then 'invalid_existing_value'
      when not (to_jsonb(c) ? 'phone_normalized')
        then 'ready_for_backfill'
      when nullif(to_jsonb(c)->>'phone_normalized', '') is null
        then 'ready_for_backfill'
      when nullif(to_jsonb(c)->>'record_version', '') is null
        then 'core_v2_missing_required'
      else 'ready_for_core_v2'
    end as readiness
  from public.customers c
) classified
group by readiness

union all

select
  'orders',
  readiness,
  count(*)
from (
  select
    case
      when o.tenant_id is null or o.branch_id is null or o.customer_id is null
        then 'invalid_existing_value'
      when not (to_jsonb(o) ? 'atomic_engine_version')
        then 'legacy_expected_missing'
      when to_jsonb(o)->>'atomic_engine_version' = 'atomic-order-v2-r1'
           and (
             nullif(to_jsonb(o)->>'idempotency_command_id', '') is null
             or nullif(to_jsonb(o)->>'correlation_id', '') is null
           )
        then 'core_v2_missing_required'
      when to_jsonb(o)->>'atomic_engine_version' = 'atomic-order-v2-r1'
        then 'ready_for_core_v2'
      when nullif(to_jsonb(o)->>'atomic_engine_version', '') is null
        then 'ready_for_backfill'
      else 'unknown_creation_generation'
    end as readiness
  from public.orders o
) classified
group by readiness

union all

select
  'invoices',
  readiness,
  count(*)
from (
  select
    case
      when i.tenant_id is null or i.branch_id is null
        or i.subtotal is null or i.discount is null or i.tax is null
        or i.total is null or i.payment_method is null
        or i.subtotal < 0 or i.discount < 0 or i.tax < 0 or i.total < 0
        then 'invalid_existing_value'
      when not (to_jsonb(i) ? 'atomic_engine_version')
        then 'legacy_expected_missing'
      when to_jsonb(i)->>'atomic_engine_version' = 'atomic-order-v2-r1'
           and (
             nullif(to_jsonb(i)->>'financial_snapshot_version', '') is null
             or nullif(to_jsonb(i)->>'financial_snapshot_hash', '') is null
             or coalesce((to_jsonb(i)->>'financial_snapshot_complete')::boolean,
                         false) is not true
             or to_jsonb(i)->'payment_snapshot' is null
           )
        then 'core_v2_missing_required'
      when to_jsonb(i)->>'atomic_engine_version' = 'atomic-order-v2-r1'
        then 'ready_for_core_v2'
      when nullif(to_jsonb(i)->>'atomic_engine_version', '') is null
        then 'ready_for_backfill'
      else 'unknown_creation_generation'
    end as readiness
  from public.invoices i
) classified
group by readiness

union all

select
  'invoice_items',
  readiness,
  count(*)
from (
  select
    case
      when ii.item_name_snapshot is null
        or ii.item_type_snapshot is null
        or ii.quantity <= 0 or ii.unit_price < 0 or ii.line_total < 0
        or ii.tenant_id is null
        then 'invalid_existing_value'
      when not (to_jsonb(ii) ? 'pricing_snapshot')
        then 'legacy_expected_missing'
      when to_jsonb(ii)->'pricing_snapshot' is null
        then 'ready_for_backfill'
      when nullif(to_jsonb(ii)->>'inventory_snapshot_version', '') is null
        then 'core_v2_missing_required'
      else 'ready_for_core_v2'
    end as readiness
  from public.invoice_items ii
) classified
group by readiness

union all

select
  'inventory_movements',
  readiness,
  count(*)
from (
  select
    case
      when m.tenant_id is null or m.branch_id is null
        or m.catalog_item_id is null or m.quantity_delta = 0
        then 'invalid_existing_value'
      when not (to_jsonb(m) ? 'inventory_engine_version')
        then 'legacy_expected_missing'
      when to_jsonb(m)->>'inventory_engine_version' = 'atomic-order-v2-r1'
           and (
             nullif(to_jsonb(m)->>'inventory_snapshot_version', '') is null
             or nullif(to_jsonb(m)->>'inventory_snapshot_hash', '') is null
           )
        then 'core_v2_missing_required'
      when to_jsonb(m)->>'inventory_engine_version' = 'atomic-order-v2-r1'
        then 'ready_for_core_v2'
      when nullif(to_jsonb(m)->>'inventory_engine_version', '') is null
        then 'ready_for_backfill'
      else 'unknown_creation_generation'
    end as readiness
  from public.inventory_movements m
) classified
group by readiness
order by object_type, readiness;

-- P1.9 Existing Core V2 object collision check.
select
  object_name,
  to_regclass('public.' || object_name) as existing_relation
from (
  values
    ('financial_quotes'),
    ('idempotency_commands'),
    ('atomic_outbox')
) as objects(object_name)
order by object_name;

select
  p.oid::regprocedure::text as existing_function
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'normalize_customer_phone_v2',
    'resolve_customer_identity_v2',
    'acquire_idempotency_command_v2',
    'allocate_branch_monthly_number_v2',
    'validate_and_apply_inventory_v2',
    'enqueue_atomic_outbox_v1',
    'claim_atomic_outbox_events_v1',
    'complete_atomic_outbox_event_v1',
    'fail_atomic_outbox_event_v1',
    'create_order_atomic_v2'
  )
order by existing_function;

-- P1.10 Migration Risk Scan.
-- reltuples is a planner estimate, not an exact row count.
select
  c.relname as table_name,
  c.reltuples::bigint as planner_estimated_rows,
  pg_total_relation_size(c.oid) as total_bytes,
  pg_size_pretty(pg_total_relation_size(c.oid)) as total_size,
  pg_relation_size(c.oid) as heap_bytes,
  pg_size_pretty(pg_relation_size(c.oid)) as heap_size,
  pg_indexes_size(c.oid) as index_bytes,
  pg_size_pretty(pg_indexes_size(c.oid)) as index_size,
  case
    when c.relname in (
      'orders', 'invoices', 'invoice_items',
      'inventory_stock', 'inventory_movements', 'customers'
    ) then true
    else false
  end as likely_hot_during_pos
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
  and c.relname in (
    'customers', 'orders', 'invoices', 'invoice_items',
    'inventory_stock', 'inventory_movements',
    'order_number_sequences', 'audit_logs'
  )
order by pg_total_relation_size(c.oid) desc, c.relname;

select
  t.relname as table_name,
  i.relname as index_name,
  pg_size_pretty(pg_relation_size(i.oid)) as index_size,
  pg_relation_size(i.oid) as index_bytes,
  ix.indisunique,
  ix.indisvalid,
  ix.indisready,
  pg_get_indexdef(i.oid) as index_definition
from pg_catalog.pg_index ix
join pg_catalog.pg_class i on i.oid = ix.indexrelid
join pg_catalog.pg_class t on t.oid = ix.indrelid
join pg_catalog.pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public'
  and t.relname in (
    'customers', 'orders', 'invoices', 'invoice_items',
    'inventory_stock', 'inventory_movements',
    'order_number_sequences', 'audit_logs'
  )
order by pg_relation_size(i.oid) desc, t.relname, i.relname;

select
  con.conrelid::regclass::text as table_name,
  con.conname,
  con.contype,
  con.convalidated,
  pg_get_constraintdef(con.oid, true) as definition
from pg_catalog.pg_constraint con
where con.connamespace = 'public'::regnamespace
  and not con.convalidated
order by table_name, con.conname;

select
  t.relname as table_name,
  i.relname as index_name,
  ix.indisvalid,
  ix.indisready,
  pg_get_indexdef(i.oid) as index_definition
from pg_catalog.pg_index ix
join pg_catalog.pg_class i on i.oid = ix.indexrelid
join pg_catalog.pg_class t on t.oid = ix.indrelid
join pg_catalog.pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public'
  and (not ix.indisvalid or not ix.indisready)
order by t.relname, i.relname;

-- Active index-build progress is optional and visibility depends on role.
select
  p.relid::regclass::text as table_name,
  p.index_relid::regclass::text as index_name,
  p.phase,
  p.blocks_total,
  p.blocks_done,
  p.tuples_total,
  p.tuples_done
from pg_catalog.pg_stat_progress_create_index p
where p.relid in (
  'public.customers'::regclass,
  'public.orders'::regclass,
  'public.invoices'::regclass,
  'public.invoice_items'::regclass,
  'public.inventory_stock'::regclass,
  'public.inventory_movements'::regclass
)
order by table_name, index_name;

-- Foreign keys without an obvious index whose leading columns equal the FK.
select
  con.conrelid::regclass::text as table_name,
  con.conname as foreign_key_name,
  pg_get_constraintdef(con.oid, true) as foreign_key_definition,
  case when exists (
    select 1
    from pg_catalog.pg_index ix
    where ix.indrelid = con.conrelid
      and ix.indisvalid
      and ix.indisready
      and con.conkey::int[] <@ ix.indkey::int[]
  ) then 'supporting_index_found'
    else 'no_obvious_supporting_index'
  end as index_support
from pg_catalog.pg_constraint con
where con.connamespace = 'public'::regnamespace
  and con.contype = 'f'
  and con.conrelid in (
    'public.customers'::regclass,
    'public.orders'::regclass,
    'public.invoices'::regclass,
    'public.invoice_items'::regclass,
    'public.inventory_stock'::regclass,
    'public.inventory_movements'::regclass
  )
order by table_name, foreign_key_name;

select *
from (
  values
    ('customers.phone_normalized', 'column/backfill',
     'row_rewrite_possible', true, false, 'high',
     'Batch existing rows; normalization and duplicate gates required.'),
    ('customers.record_version', 'column/backfill',
     'row_rewrite_possible', true, false, 'high',
     'Batch initialization; authoritative trigger added later.'),
    ('customers tenant normalized uniqueness', 'unique index',
     'index_build', false, true, 'high',
     'Concurrent build is possible outside a transaction after duplicate cleanup.'),
    ('orders Core V2 columns', 'nullable columns',
     'metadata_only', true, false, 'medium',
     'Brief table lock; no defaulted rewrite intended.'),
    ('invoices Core V2 snapshot columns', 'nullable columns',
     'metadata_only', true, false, 'medium',
     'Brief table lock; historical evidence remains nullable.'),
    ('invoice_items snapshot columns', 'nullable columns',
     'metadata_only', true, false, 'medium',
     'Hot table; schedule metadata locks carefully.'),
    ('inventory_stock.record_version', 'column/backfill',
     'row_rewrite_possible', true, false, 'high',
     'Hot row set; batch initialization required.'),
    ('inventory_movements evidence columns', 'nullable columns',
     'metadata_only', true, false, 'medium',
     'Large append-only table may make later indexes expensive.'),
    ('foreign key validation', 'constraint validation',
     'table_scan', false, false, 'high',
     'Use NOT VALID first; validate separately.'),
    ('Core V2 RLS and grants', 'security metadata',
     'metadata_only', true, false, 'critical',
     'Operational risk is authorization, not row rewrite.')
) as risk_scan(
  proposed_object,
  operation_type,
  expected_work_class,
  access_exclusive_lock,
  concurrent_capable,
  estimated_risk,
  notes
)
order by
  case estimated_risk
    when 'critical' then 1
    when 'high' then 2
    when 'medium' then 3
    else 4
  end,
  proposed_object;

-- Candidate backfill tables. Counts are planner estimates and are not downtime
-- estimates. Runtime lock duration and throughput require Clone/Staging tests.
select
  c.relname as table_name,
  c.reltuples::bigint as planner_estimated_rows,
  case
    when c.relname in ('customers', 'inventory_stock') then 'batched_required'
    when c.relname in ('orders', 'invoices', 'invoice_items')
      then 'batched_if_historical_snapshot_backfill_is_approved'
    else 'review'
  end as backfill_strategy
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'customers', 'orders', 'invoices',
    'invoice_items', 'inventory_stock', 'inventory_movements'
  )
order by c.reltuples desc, c.relname;

/*
Optional-statistics limitation:
- This package does not require pg_stat_statements.
- Planner row estimates may be stale when ANALYZE statistics are stale.
- Active index progress is visible only when PostgreSQL permissions allow it.
- No exact downtime or lock-duration estimate is asserted by this package.
*/
