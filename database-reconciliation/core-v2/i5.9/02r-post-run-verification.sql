/*
AFEX Core V2 Package 2R post-run verification.

READ ONLY. Produces one exportable result set.
Execute only after a separately authorized manual Package 2R run.
No temporary objects, locks, functions, DML, or configuration changes.
*/

with
expected_tables(table_name, expected_columns) as (
  values
    ('financial_quotes',22),
    ('idempotency_commands',27),
    ('atomic_outbox',23)
),
expected_new_columns(table_name,column_name,type_name,is_nullable,default_expression) as (
  values
    ('financial_quotes','id','uuid',false,'gen_random_uuid()'),
    ('financial_quotes','tenant_id','uuid',false,null),
    ('financial_quotes','branch_id','uuid',false,null),
    ('financial_quotes','customer_id','uuid',true,null),
    ('financial_quotes','correlation_id','text',false,null),
    ('financial_quotes','request_fingerprint','text',false,null),
    ('financial_quotes','request_fingerprint_version','text',false,null),
    ('financial_quotes','quote_fingerprint','text',false,null),
    ('financial_quotes','quote_version','text',false,null),
    ('financial_quotes','financial_engine_version','text',false,null),
    ('financial_quotes','pricing_rule_version','text',false,null),
    ('financial_quotes','vat_rule_version','text',false,null),
    ('financial_quotes','discount_rule_version','text',false,null),
    ('financial_quotes','rounding_version','text',false,null),
    ('financial_quotes','quote_snapshot_version','text',false,null),
    ('financial_quotes','quote_classification','text',false,null),
    ('financial_quotes','created_by_actor_type','text',false,null),
    ('financial_quotes','created_by_actor_id','uuid',true,null),
    ('financial_quotes','quote_payload','jsonb',false,null),
    ('financial_quotes','quote_hash','text',false,null),
    ('financial_quotes','created_at','timestamp with time zone',false,'now()'),
    ('financial_quotes','expires_at','timestamp with time zone',false,null),
    ('idempotency_commands','id','uuid',false,'gen_random_uuid()'),
    ('idempotency_commands','tenant_id','uuid',false,null),
    ('idempotency_commands','branch_id','uuid',false,null),
    ('idempotency_commands','command_type','text',false,null),
    ('idempotency_commands','key_hash','text',false,null),
    ('idempotency_commands','request_fingerprint','text',false,null),
    ('idempotency_commands','fingerprint_version','text',false,null),
    ('idempotency_commands','engine_version','text',false,null),
    ('idempotency_commands','actor_type','text',false,null),
    ('idempotency_commands','actor_id','uuid',true,null),
    ('idempotency_commands','correlation_id','text',false,null),
    ('idempotency_commands','state','text',false,null),
    ('idempotency_commands','lease_owner','text',true,null),
    ('idempotency_commands','lease_expires_at','timestamp with time zone',true,null),
    ('idempotency_commands','retry_count','integer',false,'0'),
    ('idempotency_commands','order_id','uuid',true,null),
    ('idempotency_commands','invoice_id','uuid',true,null),
    ('idempotency_commands','response_version','text',true,null),
    ('idempotency_commands','response_hash','text',true,null),
    ('idempotency_commands','last_error_code','text',true,null),
    ('idempotency_commands','started_at','timestamp with time zone',false,'now()'),
    ('idempotency_commands','committed_at','timestamp with time zone',true,null),
    ('idempotency_commands','failed_at','timestamp with time zone',true,null),
    ('idempotency_commands','recovery_started_at','timestamp with time zone',true,null),
    ('idempotency_commands','recovery_completed_at','timestamp with time zone',true,null),
    ('idempotency_commands','expires_at','timestamp with time zone',true,null),
    ('idempotency_commands','updated_at','timestamp with time zone',false,'now()'),
    ('atomic_outbox','id','uuid',false,'gen_random_uuid()'),
    ('atomic_outbox','event_id','uuid',false,null),
    ('atomic_outbox','correlation_id','text',false,null),
    ('atomic_outbox','aggregate_id','uuid',true,null),
    ('atomic_outbox','aggregate_type','text',false,null),
    ('atomic_outbox','tenant_id','uuid',false,null),
    ('atomic_outbox','branch_id','uuid',false,null),
    ('atomic_outbox','event_type','text',false,null),
    ('atomic_outbox','payload_version','text',false,null),
    ('atomic_outbox','payload','jsonb',false,null),
    ('atomic_outbox','payload_hash','text',false,null),
    ('atomic_outbox','lease_owner','text',true,null),
    ('atomic_outbox','attempt_count','integer',false,'0'),
    ('atomic_outbox','retry_count','integer',false,'0'),
    ('atomic_outbox','execution_status','text',false,'''pending_commit''::text'),
    ('atomic_outbox','next_attempt_at','timestamp with time zone',false,'now()'),
    ('atomic_outbox','lease_expires_at','timestamp with time zone',true,null),
    ('atomic_outbox','last_error_code','text',true,null),
    ('atomic_outbox','last_error_classification','text',true,null),
    ('atomic_outbox','last_error_message','text',true,null),
    ('atomic_outbox','created_at','timestamp with time zone',false,'now()'),
    ('atomic_outbox','delivered_at','timestamp with time zone',true,null),
    ('atomic_outbox','updated_at','timestamp with time zone',false,'now()')
),
expected_legacy_columns(table_name,column_name,type_name) as (
  values
    ('customers','phone_normalized','text'),
    ('customers','record_version','bigint'),
    ('orders','idempotency_command_id','uuid'),
    ('orders','correlation_id','text'),
    ('orders','source_channel','text'),
    ('orders','atomic_engine_version','text'),
    ('orders','financial_engine_version','text'),
    ('orders','customer_name_snapshot','text'),
    ('orders','customer_phone_snapshot','text'),
    ('orders','customer_record_version_snapshot','bigint'),
    ('invoices','currency_code','text'),
    ('invoices','discount_id_snapshot','uuid'),
    ('invoices','discount_name_snapshot','text'),
    ('invoices','discount_type_snapshot','text'),
    ('invoices','discount_value_snapshot','numeric(10,4)'),
    ('invoices','discount_amount','numeric(18,2)'),
    ('invoices','taxable_subtotal','numeric(18,2)'),
    ('invoices','vat_setting_id_snapshot','uuid'),
    ('invoices','vat_rate_snapshot','numeric(10,4)'),
    ('invoices','vat_amount','numeric(18,2)'),
    ('invoices','payment_rule_version','text'),
    ('invoices','request_fingerprint','text'),
    ('invoices','request_fingerprint_version','text'),
    ('invoices','quote_fingerprint','text'),
    ('invoices','quote_version','text'),
    ('invoices','financial_engine_version','text'),
    ('invoices','pricing_rule_version','text'),
    ('invoices','vat_rule_version','text'),
    ('invoices','discount_rule_version','text'),
    ('invoices','rounding_version','text'),
    ('invoices','financial_snapshot_version','text'),
    ('invoices','financial_snapshot_hash','text'),
    ('invoices','financial_snapshot_complete','boolean'),
    ('invoices','financial_completeness_reasons','jsonb'),
    ('invoices','customer_name_snapshot','text'),
    ('invoices','customer_phone_snapshot','text'),
    ('invoices','customer_email_snapshot','text'),
    ('invoices','customer_record_version_snapshot','bigint'),
    ('invoices','correlation_id','text'),
    ('invoices','financial_record_classification','text'),
    ('invoices','atomic_engine_version','text'),
    ('invoices','financial_quote_id','uuid'),
    ('invoices','payment_snapshot','jsonb'),
    ('invoice_items','line_number','integer'),
    ('invoice_items','gross_amount','numeric(18,2)'),
    ('invoice_items','discount_allocation','numeric(18,2)'),
    ('invoice_items','taxable_amount','numeric(18,2)'),
    ('invoice_items','price_source','text'),
    ('invoice_items','source_branch_price_id','uuid'),
    ('invoice_items','source_catalog_updated_at','timestamp with time zone'),
    ('invoice_items','source_branch_price_updated_at','timestamp with time zone'),
    ('invoice_items','cost_snapshot','numeric(18,2)'),
    ('invoice_items','profit_snapshot','numeric(18,2)'),
    ('invoice_items','cost_snapshot_status','text'),
    ('invoice_items','cost_snapshot_version','text'),
    ('invoice_items','inventory_tracking_mode','text'),
    ('invoice_items','inventory_movement_correlation_id','text'),
    ('invoice_items','pricing_snapshot','jsonb'),
    ('invoice_items','inventory_snapshot_version','text'),
    ('inventory_stock','record_version','bigint'),
    ('inventory_movements','movement_reason','text'),
    ('inventory_movements','quantity_before','numeric(30,6)'),
    ('inventory_movements','quantity_after','numeric(30,6)'),
    ('inventory_movements','stock_version_before','bigint'),
    ('inventory_movements','stock_version_after','bigint'),
    ('inventory_movements','order_id','uuid'),
    ('inventory_movements','invoice_id','uuid'),
    ('inventory_movements','invoice_item_id','uuid'),
    ('inventory_movements','correlation_id','text'),
    ('inventory_movements','inventory_engine_version','text'),
    ('inventory_movements','inventory_snapshot_version','text'),
    ('inventory_movements','inventory_snapshot_hash','text'),
    ('audit_logs','actor_role','text'),
    ('audit_logs','employee_id','uuid'),
    ('audit_logs','order_id','uuid'),
    ('audit_logs','invoice_id','uuid'),
    ('audit_logs','customer_id','uuid'),
    ('audit_logs','request_fingerprint','text'),
    ('audit_logs','quote_fingerprint','text'),
    ('audit_logs','event_type','text'),
    ('audit_logs','before_snapshot','jsonb'),
    ('audit_logs','after_snapshot','jsonb'),
    ('audit_logs','correlation_id','text'),
    ('audit_logs','audit_schema_version','text')
),
expected_constraints(table_name,constraint_name,expected_validated) as (
  values
    ('financial_quotes','ck_financial_quotes_request_fingerprint',true),
    ('financial_quotes','ck_financial_quotes_quote_fingerprint',true),
    ('financial_quotes','ck_financial_quotes_quote_hash',true),
    ('financial_quotes','ck_financial_quotes_correlation_id',true),
    ('financial_quotes','ck_financial_quotes_versions_nonempty',true),
    ('financial_quotes','ck_financial_quotes_payload_object',true),
    ('financial_quotes','ck_financial_quotes_expiry',true),
    ('financial_quotes','ck_financial_quotes_classification',true),
    ('financial_quotes','ck_financial_quotes_actor_type',true),
    ('idempotency_commands','ck_idempotency_commands_key_hash',true),
    ('idempotency_commands','ck_idempotency_commands_request_fingerprint',true),
    ('idempotency_commands','ck_idempotency_commands_response_hash',true),
    ('idempotency_commands','ck_idempotency_commands_state',true),
    ('idempotency_commands','ck_idempotency_commands_actor_type',true),
    ('idempotency_commands','ck_idempotency_commands_retry_count',true),
    ('idempotency_commands','ck_idempotency_commands_correlation_id',true),
    ('idempotency_commands','ck_idempotency_commands_nonempty_identity',true),
    ('idempotency_commands','ck_idempotency_commands_started_state',true),
    ('idempotency_commands','ck_idempotency_commands_committed_state',true),
    ('idempotency_commands','ck_idempotency_commands_failed_state',true),
    ('idempotency_commands','ck_idempotency_commands_expired_state',true),
    ('idempotency_commands','ck_idempotency_commands_recovery_order',true),
    ('atomic_outbox','ck_atomic_outbox_event_type',true),
    ('atomic_outbox','ck_atomic_outbox_aggregate_type',true),
    ('atomic_outbox','ck_atomic_outbox_execution_status',true),
    ('atomic_outbox','ck_atomic_outbox_payload_object',true),
    ('atomic_outbox','ck_atomic_outbox_payload_hash',true),
    ('atomic_outbox','ck_atomic_outbox_counts',true),
    ('atomic_outbox','ck_atomic_outbox_correlation_id',true),
    ('atomic_outbox','ck_atomic_outbox_payload_version',true),
    ('atomic_outbox','ck_atomic_outbox_bounded_text',true),
    ('atomic_outbox','ck_atomic_outbox_processing_lease',true),
    ('atomic_outbox','ck_atomic_outbox_nonprocessing_lease',true),
    ('atomic_outbox','ck_atomic_outbox_delivered_at',true),
    ('atomic_outbox','ck_atomic_outbox_terminal_lease',true),
    ('atomic_outbox','ck_atomic_outbox_next_attempt',true),
    ('financial_quotes','fk_financial_quotes_tenants',true),
    ('financial_quotes','fk_financial_quotes_branches',true),
    ('financial_quotes','fk_financial_quotes_customers',true),
    ('idempotency_commands','fk_idempotency_commands_tenants',true),
    ('idempotency_commands','fk_idempotency_commands_branches',true),
    ('idempotency_commands','fk_idempotency_commands_orders',true),
    ('idempotency_commands','fk_idempotency_commands_invoices',true),
    ('atomic_outbox','fk_atomic_outbox_tenants',true),
    ('atomic_outbox','fk_atomic_outbox_branches',true),
    ('atomic_outbox','uq_atomic_outbox_event_id',true),
    ('customers','ck_customers_phone_normalized',false),
    ('customers','ck_customers_record_version',false),
    ('orders','ck_orders_correlation_id',false),
    ('orders','ck_orders_customer_record_version_snapshot',false),
    ('orders','ck_orders_engine_versions',false),
    ('orders','ck_orders_core_v2_complete',false),
    ('invoices','ck_invoices_currency_code',false),
    ('invoices','ck_invoices_financial_nonnegative',false),
    ('invoices','ck_invoices_vat_rate',false),
    ('invoices','ck_invoices_request_fingerprint',false),
    ('invoices','ck_invoices_quote_fingerprint',false),
    ('invoices','ck_invoices_financial_snapshot_hash',false),
    ('invoices','ck_invoices_completeness_reasons',false),
    ('invoices','ck_invoices_customer_record_version_snapshot',false),
    ('invoices','ck_invoices_correlation_id',false),
    ('invoices','ck_invoices_payment_snapshot',false),
    ('invoices','ck_invoices_engine_versions',false),
    ('invoices','ck_invoices_core_v2_complete',false),
    ('invoice_items','ck_invoice_items_line_number',false),
    ('invoice_items','ck_invoice_items_financial_nonnegative',false),
    ('invoice_items','ck_invoice_items_discount_allocation',false),
    ('invoice_items','ck_invoice_items_taxable_amount',false),
    ('invoice_items','ck_invoice_items_price_source',false),
    ('invoice_items','ck_invoice_items_cost_status',false),
    ('invoice_items','ck_invoice_items_tracking_mode',false),
    ('invoice_items','ck_invoice_items_correlation_id',false),
    ('inventory_stock','ck_inventory_stock_record_version',false),
    ('inventory_movements','ck_inventory_movements_quantities',false),
    ('inventory_movements','ck_inventory_movements_versions',false),
    ('inventory_movements','ck_inventory_movements_snapshot_hash',false),
    ('inventory_movements','ck_inventory_movements_correlation_id',false),
    ('inventory_movements','ck_inventory_movements_engine_version',false),
    ('inventory_movements','ck_inventory_movements_core_v2_complete',false),
    ('audit_logs','ck_audit_logs_request_fingerprint',false),
    ('audit_logs','ck_audit_logs_quote_fingerprint',false),
    ('audit_logs','ck_audit_logs_correlation_id',false),
    ('audit_logs','ck_audit_logs_snapshots',false),
    ('audit_logs','ck_audit_logs_schema_version',false),
    ('orders','fk_orders_idempotency_commands',false),
    ('invoices','fk_invoices_financial_quotes',false),
    ('inventory_movements','fk_inventory_movements_orders',false),
    ('inventory_movements','fk_inventory_movements_invoices',false),
    ('inventory_movements','fk_inventory_movements_invoice_items',false),
    ('audit_logs','fk_audit_logs_orders',false),
    ('audit_logs','fk_audit_logs_invoices',false),
    ('audit_logs','fk_audit_logs_customers',false)
),
expected_indexes(table_name,index_name,is_unique) as (
  values
    ('financial_quotes','uq_financial_quotes_scope',true),
    ('financial_quotes','idx_financial_quotes_request_fingerprint',false),
    ('financial_quotes','idx_financial_quotes_expiry',false),
    ('financial_quotes','idx_financial_quotes_customer',false),
    ('idempotency_commands','uq_idempotency_commands_scope_key',true),
    ('idempotency_commands','idx_idempotency_commands_recovery_lease',false),
    ('idempotency_commands','idx_idempotency_commands_retention',false),
    ('idempotency_commands','idx_idempotency_commands_order',false),
    ('idempotency_commands','idx_idempotency_commands_invoice',false),
    ('atomic_outbox','idx_atomic_outbox_claim_ready',false),
    ('atomic_outbox','idx_atomic_outbox_processing_lease',false),
    ('atomic_outbox','idx_atomic_outbox_aggregate',false),
    ('atomic_outbox','idx_atomic_outbox_correlation',false)
),
checks as (
  select
    10 as check_order,
    'new_table_contract'::text as check_category,
    'public.' || e.table_name as object_name,
    case when c.oid is not null
           and c.relkind = 'r'
           and coalesce(a.column_count,0) = e.expected_columns
           and not c.relrowsecurity
           and not c.relforcerowsecurity
         then 'PASS' else 'FAIL' end as result,
    jsonb_build_object(
      'exists',c.oid is not null,
      'relkind',c.relkind,
      'column_count',coalesce(a.column_count,0),
      'rls_enabled',c.relrowsecurity,
      'force_rls',c.relforcerowsecurity
    ) as observed,
    jsonb_build_object(
      'relkind','r',
      'column_count',e.expected_columns,
      'rls_enabled',false,
      'force_rls',false
    ) as expected,
    'New table must be an ordinary table with the exact column count.'::text as notes
  from expected_tables e
  left join pg_namespace n on n.nspname = 'public'
  left join pg_class c on c.relnamespace = n.oid and c.relname = e.table_name
  left join lateral (
    select count(*)::integer as column_count
    from pg_attribute x
    where x.attrelid = c.oid
      and x.attnum > 0
      and not x.attisdropped
  ) a on true

  union all

  select
    15,
    'new_column_contract',
    'public.' || e.table_name || '.' || e.column_name,
    case when a.attname is not null
           and format_type(a.atttypid,a.atttypmod) = e.type_name
           and (not a.attnotnull) = e.is_nullable
           and coalesce(
             regexp_replace(lower(pg_get_expr(d.adbin,d.adrelid)),
               '[[:space:]()]','','g'),''
           ) = coalesce(
             regexp_replace(lower(e.default_expression),
               '[[:space:]()]','','g'),''
           )
         then 'PASS' else 'FAIL' end,
    jsonb_build_object(
      'exists',a.attname is not null,
      'type',case when a.attname is null then null
                  else format_type(a.atttypid,a.atttypmod) end,
      'nullable',case when a.attname is null then null else not a.attnotnull end,
      'default',case when d.oid is null then null
                     else pg_get_expr(d.adbin,d.adrelid) end
    ),
    jsonb_build_object(
      'type',e.type_name,
      'nullable',e.is_nullable,
      'default',e.default_expression
    ),
    'New-table column type, nullability, and default must match Package 2R.'
  from expected_new_columns e
  left join pg_namespace n on n.nspname = 'public'
  left join pg_class c on c.relnamespace = n.oid and c.relname = e.table_name
  left join pg_attribute a
    on a.attrelid = c.oid
   and a.attname = e.column_name
   and a.attnum > 0
   and not a.attisdropped
  left join pg_attrdef d
    on d.adrelid = a.attrelid
   and d.adnum = a.attnum

  union all

  select
    20,
    'legacy_column_contract',
    'public.' || e.table_name || '.' || e.column_name,
    case when a.attname is not null
           and format_type(a.atttypid,a.atttypmod) = e.type_name
           and not a.attnotnull
           and not a.atthasdef
         then 'PASS' else 'FAIL' end,
    jsonb_build_object(
      'exists',a.attname is not null,
      'type',case when a.attname is null then null
                  else format_type(a.atttypid,a.atttypmod) end,
      'nullable',case when a.attname is null then null else not a.attnotnull end,
      'has_default',a.atthasdef
    ),
    jsonb_build_object('type',e.type_name,'nullable',true,'has_default',false),
    'Package 2R existing-table columns must be nullable and have no default.'
  from expected_legacy_columns e
  left join pg_namespace n on n.nspname = 'public'
  left join pg_class c on c.relnamespace = n.oid and c.relname = e.table_name
  left join pg_attribute a
    on a.attrelid = c.oid
   and a.attname = e.column_name
   and a.attnum > 0
   and not a.attisdropped

  union all

  select
    30,
    'constraint_contract',
    'public.' || e.table_name || '.' || e.constraint_name,
    case when c.oid is not null and c.convalidated = e.expected_validated
         then 'PASS' else 'FAIL' end,
    jsonb_build_object(
      'exists',c.oid is not null,
      'validated',c.convalidated,
      'definition',case when c.oid is null then null
                        else pg_get_constraintdef(c.oid,true) end
    ),
    jsonb_build_object('validated',e.expected_validated),
    'Definition is exported for external comparison with the frozen Package 2R SQL.'
  from expected_constraints e
  left join pg_namespace n on n.nspname = 'public'
  left join pg_class t on t.relnamespace = n.oid and t.relname = e.table_name
  left join pg_constraint c
    on c.conrelid = t.oid
   and c.conname = e.constraint_name

  union all

  select
    40,
    'index_contract',
    'public.' || e.index_name,
    case when i.indexrelid is not null
           and i.indisvalid
           and i.indisready
           and i.indisunique = e.is_unique
           and t.relname = e.table_name
         then 'PASS' else 'FAIL' end,
    jsonb_build_object(
      'exists',i.indexrelid is not null,
      'table',t.relname,
      'unique',i.indisunique,
      'valid',i.indisvalid,
      'ready',i.indisready,
      'definition',case when i.indexrelid is null then null
                        else pg_get_indexdef(i.indexrelid) end
    ),
    jsonb_build_object(
      'table',e.table_name,
      'unique',e.is_unique,
      'valid',true,
      'ready',true
    ),
    'Definition is exported for external comparison with the frozen Package 2R SQL.'
  from expected_indexes e
  left join pg_namespace n on n.nspname = 'public'
  left join pg_class ic on ic.relnamespace = n.oid and ic.relname = e.index_name
  left join pg_index i on i.indexrelid = ic.oid
  left join pg_class t on t.oid = i.indrelid

  union all

  select 50,'new_table_empty','public.financial_quotes',
         case when count(*) = 0 then 'PASS' else 'FAIL' end,
         jsonb_build_object('row_count',count(*)),
         '{"row_count":0}'::jsonb,
         'Foundation table must remain empty.'
  from public.financial_quotes
  union all
  select 50,'new_table_empty','public.idempotency_commands',
         case when count(*) = 0 then 'PASS' else 'FAIL' end,
         jsonb_build_object('row_count',count(*)),
         '{"row_count":0}'::jsonb,
         'Foundation table must remain empty.'
  from public.idempotency_commands
  union all
  select 50,'new_table_empty','public.atomic_outbox',
         case when count(*) = 0 then 'PASS' else 'FAIL' end,
         jsonb_build_object('row_count',count(*)),
         '{"row_count":0}'::jsonb,
         'Foundation table must remain empty.'
  from public.atomic_outbox

  union all

  select
    60,
    'runtime_grant_absence',
    'public.' || t.table_name,
    case when count(g.grantee) = 0 then 'PASS' else 'FAIL' end,
    jsonb_build_object(
      'runtime_grants',coalesce(
        jsonb_agg(
          jsonb_build_object(
            'grantee',g.grantee,
            'privilege',g.privilege_type
          )
        ) filter (where g.grantee is not null),
        '[]'::jsonb
      )
    ),
    '{"runtime_grants":[]}'::jsonb,
    'No PUBLIC, anon, authenticated, or service_role grants may be introduced.'
  from expected_tables t
  left join information_schema.table_privileges g
    on g.table_schema = 'public'
   and g.table_name = t.table_name
   and g.grantee in ('PUBLIC','anon','authenticated','service_role')
  group by t.table_name

  union all

  select
    70,
    'runtime_object_absence',
    'public functions/triggers/policies on Package 2R tables',
    case when count(*) = 0 then 'PASS' else 'FAIL' end,
    jsonb_build_object('unexpected_object_count',count(*)),
    '{"unexpected_object_count":0}'::jsonb,
    'Package 2R creates no runtime function, non-internal trigger, or RLS policy.'
  from (
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'create_order_atomic_v2',
        'resolve_customer_identity_v2',
        'acquire_idempotency_command_v2',
        'claim_atomic_outbox_v2'
      )
    union all
    select t.oid
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('financial_quotes','idempotency_commands','atomic_outbox')
      and not t.tgisinternal
    union all
    select p.oid
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('financial_quotes','idempotency_commands','atomic_outbox')
  ) unexpected

  union all

  select
    80,
    'core_v2_disabled',
    'activation control objects',
    case when count(*) = 0 then 'PASS' else 'FAIL' end,
    jsonb_build_object(
      'present_objects',coalesce(jsonb_agg(c.relname)
        filter (where c.relname is not null),'[]'::jsonb)
    ),
    '{"present_objects":[]}'::jsonb,
    'Package 6 activation objects must remain absent after Package 2R.'
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in (
      'core_v2_activation_control',
      'core_v2_tenant_activation',
      'core_v2_branch_activation'
    )

  union all

  select
    90,
    'legacy_row_count_evidence',
    'public.' || x.table_name,
    'COMPARE_TO_PRE_RUN',
    jsonb_build_object('post_run_row_count',x.row_count),
    '{"required":"must equal separately recorded pre-run count"}'::jsonb,
    'Package 2R contains no DML; operator must compare this count with pre-run evidence.'
  from (
    select 'customers'::text table_name,count(*)::bigint row_count from public.customers
    union all select 'orders',count(*) from public.orders
    union all select 'invoices',count(*) from public.invoices
    union all select 'invoice_items',count(*) from public.invoice_items
    union all select 'inventory_stock',count(*) from public.inventory_stock
    union all select 'inventory_movements',count(*) from public.inventory_movements
    union all select 'audit_logs',count(*) from public.audit_logs
  ) x
)
select
  check_category,
  object_name,
  result,
  observed,
  expected,
  notes
from checks
order by check_order,check_category,object_name;
