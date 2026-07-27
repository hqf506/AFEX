/*
AFEX Core V2 Package 4T pre-run verification.

READ ONLY. Execute only after external approval.
No DML, DDL, temporary objects, explicit row locks, advisory locks, function
invocation, or configuration changes.
*/

with
required_relations(object_name,relation_kind) as (
  values
    ('customers','r'),
    ('orders','r'),
    ('invoices','r'),
    ('invoice_items','r'),
    ('inventory_stock','r'),
    ('inventory_movements','r'),
    ('audit_logs','r'),
    ('financial_quotes','r'),
    ('idempotency_commands','r'),
    ('atomic_outbox','r'),
    ('atomic_authorization_contexts','r'),
    ('order_number_sequences','r'),
    ('core_v2_activation_control','r'),
    ('core_v2_tenant_activation','r'),
    ('core_v2_branch_activation','r')
),
relation_checks as (
  select
    row_number() over (order by object_name) as item_order,
    'required_relation'::text as category,
    object_name as check_name,
    case when c.oid is not null and c.relkind = r.relation_kind
      then 'PASS' else 'FAIL' end as result,
    coalesce(c.relkind::text,'MISSING') as observed
  from required_relations r
  left join pg_namespace n on n.nspname = 'public'
  left join pg_class c
    on c.relnamespace = n.oid
   and c.relname = r.object_name
),
required_columns(table_name,column_name,type_name) as (
  values
    ('customers','tenant_id','uuid'),
    ('customers','phone_normalized','text'),
    ('customers','record_version','bigint'),
    ('inventory_stock','tenant_id','uuid'),
    ('inventory_stock','branch_id','uuid'),
    ('inventory_stock','catalog_item_id','uuid'),
    ('inventory_stock','record_version','bigint'),
    ('orders','idempotency_command_id','uuid'),
    ('orders','correlation_id','text'),
    ('orders','atomic_engine_version','text'),
    ('invoices','financial_quote_id','uuid'),
    ('invoices','financial_snapshot_hash','text'),
    ('invoices','payment_snapshot','jsonb'),
    ('invoice_items','pricing_snapshot','jsonb'),
    ('invoice_items','inventory_snapshot_hash','text'),
    ('inventory_movements','order_id','uuid'),
    ('inventory_movements','invoice_id','uuid'),
    ('inventory_movements','invoice_item_id','uuid'),
    ('audit_logs','correlation_id','text'),
    ('financial_quotes','id','uuid'),
    ('financial_quotes','tenant_id','uuid'),
    ('financial_quotes','branch_id','uuid'),
    ('financial_quotes','request_fingerprint','text'),
    ('financial_quotes','request_fingerprint_version','text'),
    ('financial_quotes','quote_fingerprint','text'),
    ('financial_quotes','quote_version','text'),
    ('financial_quotes','financial_engine_version','text'),
    ('financial_quotes','pricing_rule_version','text'),
    ('financial_quotes','vat_rule_version','text'),
    ('financial_quotes','discount_rule_version','text'),
    ('financial_quotes','rounding_version','text'),
    ('financial_quotes','quote_snapshot_version','text'),
    ('financial_quotes','quote_classification','text'),
    ('financial_quotes','quote_payload','jsonb'),
    ('financial_quotes','quote_hash','text'),
    ('financial_quotes','expires_at','timestamp with time zone'),
    ('financial_quotes','authorization_context_id','uuid'),
    ('financial_quotes','issuer_context_version','text')
),
column_checks as (
  select
    row_number() over (order by e.table_name,e.column_name) as item_order,
    'required_column'::text as category,
    e.table_name || '.' || e.column_name as check_name,
    case when c.column_name is not null
              and c.data_type = e.type_name
      then 'PASS' else 'FAIL' end as result,
    coalesce(c.data_type,'MISSING') as observed
  from required_columns e
  left join information_schema.columns c
    on c.table_schema = 'public'
   and c.table_name = e.table_name
   and c.column_name = e.column_name
),
required_procedures(signature) as (
  values
    ('consume_atomic_authorization_context_v1(text,text,uuid)'),
    ('issue_authoritative_financial_quote_v1(text,jsonb,text)'),
    ('verify_authoritative_quote_hash_v1(jsonb,text)'),
    ('validate_atomic_authorization_context_internal_v1(text,text,text,uuid)')
),
procedure_checks as (
  select
    row_number() over (order by signature) as item_order,
    'required_dependency_function'::text as category,
    signature as check_name,
    case when to_regprocedure('public.' || signature) is not null
      then 'PASS' else 'FAIL' end as result,
    coalesce(to_regprocedure('public.' || signature)::text,'MISSING') as observed
  from required_procedures
),
quote_context_contract_checks as (
  select
    1 as item_order,
    'quote_context_contract'::text as category,
    'uq_financial_quotes_authorization_context'::text as check_name,
    case when count(*) = 1
                   and bool_and(i.indisunique and i.indisvalid and i.indisready)
      then 'PASS' else 'FAIL' end as result,
    count(*)::text as observed
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_index i on i.indexrelid = c.oid
  where n.nspname = 'public'
    and c.relname = 'uq_financial_quotes_authorization_context'
  union all
  select
    2,
    'quote_context_contract',
    'fk_financial_quotes_authorization_context',
    case when count(*) = 1 and bool_and(c.contype = 'f')
      then 'PASS' else 'FAIL' end,
    count(*)::text
  from pg_constraint c
  where c.conrelid = 'public.financial_quotes'::regclass
    and c.conname = 'fk_financial_quotes_authorization_context'
),
data_gates as (
  select 1 as item_order,'data_gate'::text as category,
    'customers_missing_tenant'::text as check_name,
    case when count(*) = 0 then 'PASS' else 'FAIL' end as result,
    count(*)::text as observed
  from public.customers where tenant_id is null
  union all
  select 2,'data_gate','customers_missing_normalized_phone',
    case when count(*) = 0 then 'PASS' else 'FAIL' end,count(*)::text
  from public.customers
  where nullif(btrim(coalesce(phone,'')),'') is not null
    and phone_normalized is null
  union all
  select 3,'data_gate','customers_invalid_normalized_phone',
    case when count(*) = 0 then 'PASS' else 'FAIL' end,count(*)::text
  from public.customers
  where phone_normalized is not null
    and phone_normalized !~ '^9665[0-9]{8}$'
  union all
  select 4,'data_gate','customers_invalid_record_version',
    case when count(*) = 0 then 'PASS' else 'FAIL' end,count(*)::text
  from public.customers where record_version is null or record_version < 1
  union all
  select 5,'data_gate','inventory_invalid_record_version',
    case when count(*) = 0 then 'PASS' else 'FAIL' end,count(*)::text
  from public.inventory_stock where record_version is null or record_version < 1
),
duplicate_gate as (
  select
    6 as item_order,
    'data_gate'::text as category,
    'same_tenant_normalized_customer_duplicates'::text as check_name,
    case when count(*) = 0 then 'PASS' else 'FAIL' end as result,
    count(*)::text as observed
  from (
    select tenant_id,phone_normalized
    from public.customers
    where tenant_id is not null and phone_normalized is not null
    group by tenant_id,phone_normalized
    having count(*) > 1
  ) d
),
index_gate as (
  select
    7 as item_order,
    'data_gate'::text as category,
    'uq_customers_tenant_phone_normalized'::text as check_name,
    case when count(*) = 1
                   and bool_and(i.indisunique and i.indisvalid and i.indisready)
      then 'PASS' else 'FAIL' end as result,
    count(*)::text as observed
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_index i on i.indexrelid = c.oid
  where n.nspname = 'public'
    and c.relname = 'uq_customers_tenant_phone_normalized'
),
activation_gates as (
  select
    1 as item_order,
    'activation_state'::text as category,
    'global_core_v2_flags_disabled'::text as check_name,
    case
      when count(*) = 1
       and bool_and(not global_enabled)
       and bool_and(kill_switch)
       and bool_and(not pos_enabled)
       and bool_and(not admin_orders_enabled)
       and bool_and(not quote_issuer_enabled)
       and bool_and(not outbox_worker_enabled)
       and bool_and(deterministic_canary_percentage = 0)
      then 'PASS' else 'FAIL'
    end as result,
    coalesce(
      string_agg(
        format(
          'rows=1 global=%s kill=%s pos=%s admin=%s quote=%s outbox=%s canary=%s',
          global_enabled,kill_switch,pos_enabled,admin_orders_enabled,
          quote_issuer_enabled,outbox_worker_enabled,
          deterministic_canary_percentage
        ),
        '; '
      ),
      'CONTROL_ROW_MISSING'
    ) as observed
  from public.core_v2_activation_control
  where singleton_id
  union all
  select
    2,
    'activation_state',
    'tenant_core_v2_flags_disabled',
    case when count(*) = 0 then 'PASS' else 'FAIL' end,
    count(*)::text
  from public.core_v2_tenant_activation
  where enabled
     or canary_eligible
     or pos_enabled
     or admin_orders_enabled
     or quote_enabled
  union all
  select
    3,
    'activation_state',
    'branch_core_v2_flags_disabled',
    case when count(*) = 0 then 'PASS' else 'FAIL' end,
    count(*)::text
  from public.core_v2_branch_activation
  where enabled
     or canary_eligible
     or pos_enabled
     or admin_orders_enabled
     or quote_enabled
),
atomic_entry_state as (
  select
    1 as item_order,
    'installation_state'::text as category,
    'create_order_atomic_v2_preexisting'::text as check_name,
    case when count(*) in (0,1) then 'PASS' else 'FAIL' end as result,
    count(*)::text as observed
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'create_order_atomic_v2'
),
runtime_roles(role_name) as (values
  ('PUBLIC'),('anon'),('authenticated'),('service_role'),
  ('afex_core_runtime'),('afex_context_issuer'),('afex_outbox_worker'),
  ('afex_core_activation_operator')
),
entry_acl_gate as (
  select
    row_number() over (order by role_name) + 1 as item_order,
    'installation_state'::text as category,
    'atomic_execute_closed_for_' || role_name as check_name,
    case
      when to_regprocedure(
        'public.create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)'
      ) is null then 'PASS'
      when to_regrole(role_name) is null and role_name <> 'PUBLIC' then 'FAIL'
      when not has_function_privilege(
        role_name,
        'public.create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)',
        'EXECUTE'
      ) then 'PASS'
      else 'FAIL'
    end as result,
    case
      when to_regprocedure(
        'public.create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)'
      ) is null then 'NOT_INSTALLED'
      when to_regrole(role_name) is null and role_name <> 'PUBLIC'
        then 'ROLE_MISSING'
      else has_function_privilege(
        role_name,
        'public.create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)',
        'EXECUTE'
      )::text
    end as observed
  from runtime_roles
),
all_checks as (
  select
    100 + item_order as check_order,
    category,check_name,result,observed
  from relation_checks
  union all
  select
    200 + item_order,
    category,check_name,result,observed
  from column_checks
  union all
  select
    300 + item_order,
    category,check_name,result,observed
  from procedure_checks
  union all
  select
    350 + item_order,
    category,check_name,result,observed
  from quote_context_contract_checks
  union all
  select
    400 + item_order,
    category,check_name,result,observed
  from data_gates
  union all
  select
    406,
    category,check_name,result,observed
  from duplicate_gate
  union all
  select
    407,
    category,check_name,result,observed
  from index_gate
  union all
  select
    450 + item_order,
    category,check_name,result,observed
  from activation_gates
  union all
  select
    500 + item_order,
    category,check_name,result,observed
  from atomic_entry_state
  union all
  select
    500 + item_order,
    category,check_name,result,observed
  from entry_acl_gate
)
select category,check_name,result,observed
from all_checks
order by check_order,check_name;
