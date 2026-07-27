/*
AFEX Core V2 Package 3R post-run verification.

READ ONLY. Produces one exportable result set.
No DML, DDL, temporary objects, explicit locks, or configuration changes.
*/

with
normalized_customers as (
  select
    c.id,
    c.tenant_id,
    c.phone,
    c.phone_normalized,
    c.record_version,
    case
      when x.compact_phone ~ '^05[0-9]{8}$'
        then '966' || substring(x.compact_phone from 2)
      when x.compact_phone ~ '^5[0-9]{8}$'
        then '966' || x.compact_phone
      when x.compact_phone ~ '^\+9665[0-9]{8}$'
        then substring(x.compact_phone from 2)
      when x.compact_phone ~ '^9665[0-9]{8}$'
        then x.compact_phone
      else null
    end as derived_phone_normalized
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
  ) x
),
duplicate_groups as (
  select tenant_id,derived_phone_normalized
  from normalized_customers
  where tenant_id is not null
    and derived_phone_normalized is not null
  group by tenant_id,derived_phone_normalized
  having count(*) > 1
),
index_state as (
  select
    count(*) as object_count,
    bool_and(
      i.indrelid = 'public.customers'::regclass
      and i.indisunique
      and i.indisvalid
      and i.indisready
      and array(
        select a.attname
        from unnest(i.indkey::smallint[]) with ordinality k(attnum,ord)
        join pg_attribute a
          on a.attrelid = i.indrelid and a.attnum = k.attnum
        where k.attnum > 0
        order by k.ord
      ) = array['tenant_id','phone_normalized']
      and regexp_replace(
        replace(lower(pg_get_expr(i.indpred,i.indrelid)),'::text',''),
        '[[:space:]()]','','g'
      ) = 'phone_normalizedisnotnull'
    ) as exact_contract
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_index i on i.indexrelid = c.oid
  where n.nspname = 'public'
    and c.relname = 'uq_customers_tenant_phone_normalized'
),
expected_constraints(table_name,constraint_name,constraint_definition) as (
  values
    (
      'customers',
      'ck_customers_phone_normalized',
      'CHECK (((phone_normalized IS NULL) OR (phone_normalized ~ ''^9665[0-9]{8}$''::text)))'
    ),
    (
      'customers',
      'ck_customers_record_version',
      'CHECK (((record_version IS NULL) OR (record_version >= 1)))'
    ),
    (
      'inventory_stock',
      'ck_inventory_stock_record_version',
      'CHECK (((record_version IS NULL) OR (record_version >= 1)))'
    )
),
checks as (
  select
    10 as check_order,
    'customer_identity'::text as category,
    'customers_requiring_phone_normalization'::text as check_name,
    case when count(*) = 0 then 'PASS' else 'FAIL' end as result,
    count(*)::text as observed,
    '0'::text as expected,
    'Every supported phone must have its canonical identity.'::text as notes
  from normalized_customers
  where derived_phone_normalized is not null
    and phone_normalized is null

  union all

  select 11,'customer_identity','invalid_nonempty_phone_count',
    case when count(*) = 0 then 'PASS' else 'FAIL' end,
    count(*)::text,'0',
    'Unsupported non-empty customer phones block Package 3 completion.'
  from normalized_customers
  where nullif(btrim(coalesce(phone,'')),'') is not null
    and derived_phone_normalized is null

  union all

  select 12,'customer_identity','missing_customer_tenant_count',
    case when count(*) = 0 then 'PASS' else 'FAIL' end,
    count(*)::text,'0',
    'Canonical customer identity requires tenant_id.'
  from normalized_customers
  where tenant_id is null

  union all

  select 13,'customer_identity','normalization_conflict_count',
    case when count(*) = 0 then 'PASS' else 'FAIL' end,
    count(*)::text,'0',
    'Stored normalized identity must equal deterministic derivation.'
  from normalized_customers
  where phone_normalized is not null
    and phone_normalized is distinct from derived_phone_normalized

  union all

  select 14,'customer_identity','duplicate_canonical_identity_group_count',
    case when count(*) = 0 then 'PASS' else 'FAIL' end,
    count(*)::text,'0',
    'Same-tenant canonical duplicates are not reconciled by Package 3R.'
  from duplicate_groups

  union all

  select 20,'record_versions','customers_requiring_record_version',
    case when count(*) = 0 then 'PASS' else 'FAIL' end,
    count(*)::text,'0',
    'Customer record_version must be initialized.'
  from public.customers
  where record_version is null

  union all

  select 21,'record_versions','invalid_customer_record_version_count',
    case when count(*) = 0 then 'PASS' else 'FAIL' end,
    count(*)::text,'0',
    'Customer record_version must be at least one.'
  from public.customers
  where record_version < 1

  union all

  select 22,'record_versions','inventory_requiring_record_version',
    case when count(*) = 0 then 'PASS' else 'FAIL' end,
    count(*)::text,'0',
    'Inventory record_version must be initialized.'
  from public.inventory_stock
  where record_version is null

  union all

  select 23,'record_versions','invalid_inventory_record_version_count',
    case when count(*) = 0 then 'PASS' else 'FAIL' end,
    count(*)::text,'0',
    'Inventory record_version must be at least one.'
  from public.inventory_stock
  where record_version < 1

  union all

  select 30,'index','canonical_customer_identity_index',
    case when object_count = 1 and coalesce(exact_contract,false)
         then 'PASS' else 'FAIL' end,
    jsonb_build_object(
      'object_count',object_count,
      'exact_contract',exact_contract
    )::text,
    '{"object_count":1,"exact_contract":true}',
    'Canonical partial unique index must exist, be unique, valid, and ready.'
  from index_state

  union all

  select
    40,
    'constraints',
    e.table_name || '.' || e.constraint_name,
    case when c.oid is not null
           and regexp_replace(
             lower(pg_get_constraintdef(c.oid,true)),
             '[[:space:]()]','','g'
           ) = regexp_replace(
             lower(e.constraint_definition),
             '[[:space:]()]','','g'
           )
         then 'PASS' else 'FAIL' end,
    jsonb_build_object(
      'exists',c.oid is not null,
      'validated',c.convalidated,
      'definition',case when c.oid is null then null
                        else pg_get_constraintdef(c.oid,true) end
    )::text,
    jsonb_build_object(
      'exists',true,
      'definition',e.constraint_definition
    )::text,
    'Constraint must exist with the exact definition; validation state is exported.'
  from expected_constraints e
  left join pg_namespace n on n.nspname = 'public'
  left join pg_class t
    on t.relnamespace = n.oid
   and t.relname = e.table_name
  left join pg_constraint c
    on c.conrelid = t.oid
   and c.conname = e.constraint_name
   and c.contype = 'c'

  union all

  select 50,'activation','unexpected_core_v2_marker_count',
    case when count(*) = 0 then 'PASS' else 'FAIL' end,
    count(*)::text,'0',
    'Package 3R must run before any Core V2 runtime marker exists.'
  from (
    select id from public.orders
    where atomic_engine_version = 'atomic-order-v2-r1'
    union all
    select id from public.invoices
    where atomic_engine_version = 'atomic-order-v2-r1'
       or financial_engine_version = 'financial-engine-v2-r1'
    union all
    select id from public.inventory_movements
    where inventory_engine_version = 'inventory-engine-v2-r1'
  ) markers

  union all

  select 51,'activation','activation_control_object_count',
    case when count(*) = 0 then 'PASS' else 'FAIL' end,
    count(*)::text,'0',
    'Package 6 activation-control objects must remain absent.'
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in (
      'core_v2_activation_control',
      'core_v2_tenant_activation',
      'core_v2_branch_activation'
    )

  union all

  select 60,'foundation_tables','financial_quotes_row_count',
    case when count(*) = 0 then 'PASS' else 'FAIL' end,
    count(*)::text,'0',
    'Package 3R must not write financial quotes.'
  from public.financial_quotes

  union all

  select 61,'foundation_tables','idempotency_commands_row_count',
    case when count(*) = 0 then 'PASS' else 'FAIL' end,
    count(*)::text,'0',
    'Package 3R must not write idempotency commands.'
  from public.idempotency_commands

  union all

  select 62,'foundation_tables','atomic_outbox_row_count',
    case when count(*) = 0 then 'PASS' else 'FAIL' end,
    count(*)::text,'0',
    'Package 3R must not write outbox events.'
  from public.atomic_outbox

  union all

  select 70,'deferred_reconciliation','branch_prefix_missing_or_invalid',
    case when count(*) = 0 then 'PASS' else 'REVIEW_REQUIRED' end,
    count(*)::text,'0',
    'Package 3R does not reconcile branch prefixes.'
  from public.branches
  where deleted_at is null
    and (
      order_number_prefix is null
      or order_number_prefix !~ '^[0-9]{2}$'
    )

  union all

  select 71,'deferred_reconciliation','invoice_order_number_mismatch_count',
    case when count(*) = 0 then 'PASS' else 'REVIEW_REQUIRED' end,
    count(*)::text,'0',
    'Package 3R does not reconcile historical invoice/order numbering.'
  from public.invoices i
  join public.orders o on o.id = i.order_id
  where i.invoice_number is distinct from o.order_number

  union all

  select
    80,
    'legacy_row_count_evidence',
    x.table_name,
    'COMPARE_TO_PRE_RUN',
    x.row_count::text,
    'must equal separately recorded pre-run count',
    'Package 3R updates existing rows but must not insert or delete rows.'
  from (
    select 'customers'::text table_name,count(*)::bigint row_count
    from public.customers
    union all
    select 'inventory_stock',count(*) from public.inventory_stock
    union all
    select 'orders',count(*) from public.orders
    union all
    select 'invoices',count(*) from public.invoices
    union all
    select 'invoice_items',count(*) from public.invoice_items
    union all
    select 'inventory_movements',count(*) from public.inventory_movements
  ) x
)
select
  category,
  check_name,
  result,
  observed,
  expected,
  notes
from checks
order by check_order,category,check_name;
