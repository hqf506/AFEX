/*
AFEX Core V2 I5.9 — Package 2R: Schema Foundation
Purpose: create the three empty Core V2 tables and add nullable foundation
columns/constraints without backfill, functions, triggers, security or activation.
Objects created: financial_quotes, idempotency_commands, atomic_outbox.
Existing tables extended: customers, orders, invoices, invoice_items,
inventory_stock, inventory_movements, audit_logs.
Dependencies: approved Package 1R evidence and PostgreSQL 17.
Ownership/RLS/grants: Package 5.
Backfill: Package 3.
Atomic behavior: Package 4.
Activation and trigger coexistence: Package 6.
Existing-table indexes: Package 2B, outside this transaction.
Lock impact: nullable column additions and NOT VALID constraints take brief
ACCESS EXCLUSIVE locks but do not scan or rewrite legacy rows.
*/

begin;

-- New relations are created only when absent. Existing relations are rejected
-- unless they are ordinary tables; the complete column contract is verified
-- later in this package.
do $create_new_tables$
begin
  if to_regclass('public.financial_quotes') is null then
    execute $ddl$
      create table public.financial_quotes (
        id uuid primary key default gen_random_uuid(),
        tenant_id uuid not null,
        branch_id uuid not null,
        customer_id uuid,
        correlation_id text not null,
        request_fingerprint text not null,
        request_fingerprint_version text not null,
        quote_fingerprint text not null,
        quote_version text not null,
        financial_engine_version text not null,
        pricing_rule_version text not null,
        vat_rule_version text not null,
        discount_rule_version text not null,
        rounding_version text not null,
        quote_snapshot_version text not null,
        quote_classification text not null,
        created_by_actor_type text not null,
        created_by_actor_id uuid,
        quote_payload jsonb not null,
        quote_hash text not null,
        created_at timestamptz not null default now(),
        expires_at timestamptz not null
      )
    $ddl$;
  elsif not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'financial_quotes'
      and c.relkind = 'r'
  ) then
    raise exception 'SCHEMA_DRIFT: public.financial_quotes is not an ordinary table';
  end if;

  if to_regclass('public.idempotency_commands') is null then
    execute $ddl$
      create table public.idempotency_commands (
        id uuid primary key default gen_random_uuid(),
        tenant_id uuid not null,
        branch_id uuid not null,
        command_type text not null,
        key_hash text not null,
        request_fingerprint text not null,
        fingerprint_version text not null,
        engine_version text not null,
        actor_type text not null,
        actor_id uuid,
        correlation_id text not null,
        state text not null,
        lease_owner text,
        lease_expires_at timestamptz,
        retry_count integer not null default 0,
        order_id uuid,
        invoice_id uuid,
        response_version text,
        response_hash text,
        last_error_code text,
        started_at timestamptz not null default now(),
        committed_at timestamptz,
        failed_at timestamptz,
        recovery_started_at timestamptz,
        recovery_completed_at timestamptz,
        expires_at timestamptz,
        updated_at timestamptz not null default now()
      )
    $ddl$;
  elsif not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'idempotency_commands'
      and c.relkind = 'r'
  ) then
    raise exception 'SCHEMA_DRIFT: public.idempotency_commands is not an ordinary table';
  end if;

  if to_regclass('public.atomic_outbox') is null then
    execute $ddl$
      create table public.atomic_outbox (
        id uuid primary key default gen_random_uuid(),
        event_id uuid not null,
        correlation_id text not null,
        aggregate_id uuid,
        aggregate_type text not null,
        tenant_id uuid not null,
        branch_id uuid not null,
        event_type text not null,
        payload_version text not null,
        payload jsonb not null,
        payload_hash text not null,
        lease_owner text,
        attempt_count integer not null default 0,
        retry_count integer not null default 0,
        execution_status text not null default 'pending_commit',
        next_attempt_at timestamptz not null default now(),
        lease_expires_at timestamptz,
        last_error_code text,
        last_error_classification text,
        last_error_message text,
        created_at timestamptz not null default now(),
        delivered_at timestamptz,
        updated_at timestamptz not null default now()
      )
    $ddl$;
  elsif not exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'atomic_outbox'
      and c.relkind = 'r'
  ) then
    raise exception 'SCHEMA_DRIFT: public.atomic_outbox is not an ordinary table';
  end if;
end;
$create_new_tables$;

-- Add existing-table columns only when absent. If present, exact type,
-- nullability and absence of a fabricated historical default are required.
do $existing_columns$
declare
  r record;
  v_type text;
  v_not_null boolean;
  v_has_default boolean;
begin
  for r in
    select *
    from (values
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
    ) expected(table_name,column_name,type_name)
  loop
    select format_type(a.atttypid,a.atttypmod), a.attnotnull, a.atthasdef
    into v_type, v_not_null, v_has_default
    from pg_attribute a
    where a.attrelid = format('public.%I',r.table_name)::regclass
      and a.attname = r.column_name
      and a.attnum > 0
      and not a.attisdropped;

    if not found then
      execute format(
        'alter table public.%I add column %I %s',
        r.table_name, r.column_name, r.type_name
      );
    elsif v_type <> r.type_name or v_not_null or v_has_default then
      raise exception
        'SCHEMA_DRIFT: %.% expected type %, nullable, no default; found type %, not_null %, has_default %',
        r.table_name, r.column_name, r.type_name,
        v_type, v_not_null, v_has_default;
    end if;
  end loop;
end;
$existing_columns$;

-- Verify the complete new-table column contracts after creation or on rerun.
do $verify_new_table_columns$
declare
  r record;
  v_type text;
  v_not_null boolean;
begin
  for r in
    select *
    from (values
      ('financial_quotes','id','uuid',true),
      ('financial_quotes','tenant_id','uuid',true),
      ('financial_quotes','branch_id','uuid',true),
      ('financial_quotes','customer_id','uuid',false),
      ('financial_quotes','correlation_id','text',true),
      ('financial_quotes','request_fingerprint','text',true),
      ('financial_quotes','request_fingerprint_version','text',true),
      ('financial_quotes','quote_fingerprint','text',true),
      ('financial_quotes','quote_version','text',true),
      ('financial_quotes','financial_engine_version','text',true),
      ('financial_quotes','pricing_rule_version','text',true),
      ('financial_quotes','vat_rule_version','text',true),
      ('financial_quotes','discount_rule_version','text',true),
      ('financial_quotes','rounding_version','text',true),
      ('financial_quotes','quote_snapshot_version','text',true),
      ('financial_quotes','quote_classification','text',true),
      ('financial_quotes','created_by_actor_type','text',true),
      ('financial_quotes','created_by_actor_id','uuid',false),
      ('financial_quotes','quote_payload','jsonb',true),
      ('financial_quotes','quote_hash','text',true),
      ('financial_quotes','created_at','timestamp with time zone',true),
      ('financial_quotes','expires_at','timestamp with time zone',true),
      ('idempotency_commands','id','uuid',true),
      ('idempotency_commands','tenant_id','uuid',true),
      ('idempotency_commands','branch_id','uuid',true),
      ('idempotency_commands','command_type','text',true),
      ('idempotency_commands','key_hash','text',true),
      ('idempotency_commands','request_fingerprint','text',true),
      ('idempotency_commands','fingerprint_version','text',true),
      ('idempotency_commands','engine_version','text',true),
      ('idempotency_commands','actor_type','text',true),
      ('idempotency_commands','actor_id','uuid',false),
      ('idempotency_commands','correlation_id','text',true),
      ('idempotency_commands','state','text',true),
      ('idempotency_commands','lease_owner','text',false),
      ('idempotency_commands','lease_expires_at','timestamp with time zone',false),
      ('idempotency_commands','retry_count','integer',true),
      ('idempotency_commands','order_id','uuid',false),
      ('idempotency_commands','invoice_id','uuid',false),
      ('idempotency_commands','response_version','text',false),
      ('idempotency_commands','response_hash','text',false),
      ('idempotency_commands','last_error_code','text',false),
      ('idempotency_commands','started_at','timestamp with time zone',true),
      ('idempotency_commands','committed_at','timestamp with time zone',false),
      ('idempotency_commands','failed_at','timestamp with time zone',false),
      ('idempotency_commands','recovery_started_at','timestamp with time zone',false),
      ('idempotency_commands','recovery_completed_at','timestamp with time zone',false),
      ('idempotency_commands','expires_at','timestamp with time zone',false),
      ('idempotency_commands','updated_at','timestamp with time zone',true),
      ('atomic_outbox','id','uuid',true),
      ('atomic_outbox','event_id','uuid',true),
      ('atomic_outbox','correlation_id','text',true),
      ('atomic_outbox','aggregate_id','uuid',false),
      ('atomic_outbox','aggregate_type','text',true),
      ('atomic_outbox','tenant_id','uuid',true),
      ('atomic_outbox','branch_id','uuid',true),
      ('atomic_outbox','event_type','text',true),
      ('atomic_outbox','payload_version','text',true),
      ('atomic_outbox','payload','jsonb',true),
      ('atomic_outbox','payload_hash','text',true),
      ('atomic_outbox','lease_owner','text',false),
      ('atomic_outbox','attempt_count','integer',true),
      ('atomic_outbox','retry_count','integer',true),
      ('atomic_outbox','execution_status','text',true),
      ('atomic_outbox','next_attempt_at','timestamp with time zone',true),
      ('atomic_outbox','lease_expires_at','timestamp with time zone',false),
      ('atomic_outbox','last_error_code','text',false),
      ('atomic_outbox','last_error_classification','text',false),
      ('atomic_outbox','last_error_message','text',false),
      ('atomic_outbox','created_at','timestamp with time zone',true),
      ('atomic_outbox','delivered_at','timestamp with time zone',false),
      ('atomic_outbox','updated_at','timestamp with time zone',true)
    ) expected(table_name,column_name,type_name,not_null)
  loop
    select format_type(a.atttypid,a.atttypmod), a.attnotnull
    into v_type, v_not_null
    from pg_attribute a
    where a.attrelid = format('public.%I',r.table_name)::regclass
      and a.attname = r.column_name
      and a.attnum > 0
      and not a.attisdropped;
    if not found or v_type <> r.type_name or v_not_null <> r.not_null then
      raise exception
        'SCHEMA_DRIFT: %.% expected type %, not_null %; found type %, not_null %',
        r.table_name, r.column_name, r.type_name, r.not_null,
        coalesce(v_type,'MISSING'), v_not_null;
    end if;
  end loop;
end;
$verify_new_table_columns$;

-- Exact defaults and primary keys are part of the new-table drift contract.
do $verify_new_table_defaults_and_primary_keys$
declare
  r record;
  v_default text;
  v_pk_columns text[];
  v_actual_columns text[];
  v_expected_columns text[];
begin
  for r in
    select *
    from (values
      ('financial_quotes','id','gen_random_uuid()'),
      ('financial_quotes','created_at','now()'),
      ('idempotency_commands','id','gen_random_uuid()'),
      ('idempotency_commands','retry_count','0'),
      ('idempotency_commands','started_at','now()'),
      ('idempotency_commands','updated_at','now()'),
      ('atomic_outbox','id','gen_random_uuid()'),
      ('atomic_outbox','attempt_count','0'),
      ('atomic_outbox','retry_count','0'),
      ('atomic_outbox','execution_status','''pending_commit''::text'),
      ('atomic_outbox','next_attempt_at','now()'),
      ('atomic_outbox','created_at','now()'),
      ('atomic_outbox','updated_at','now()')
    ) expected(table_name,column_name,default_expression)
  loop
    select pg_get_expr(d.adbin,d.adrelid)
    into v_default
    from pg_attribute a
    join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where a.attrelid = format('public.%I',r.table_name)::regclass
      and a.attname = r.column_name;
    if not found
       or regexp_replace(lower(v_default),'[[:space:]()]','','g')
          <> regexp_replace(lower(r.default_expression),'[[:space:]()]','','g') then
      raise exception 'SCHEMA_DRIFT: default for %.% differs',
        r.table_name,r.column_name;
    end if;
  end loop;

  if exists (
    select 1
    from pg_attribute a
    where a.attrelid in (
      'public.financial_quotes'::regclass,
      'public.idempotency_commands'::regclass,
      'public.atomic_outbox'::regclass
    )
      and a.attnum > 0
      and not a.attisdropped
      and a.atthasdef
      and (a.attrelid::regclass::text,a.attname) not in (
        ('financial_quotes','id'),
        ('financial_quotes','created_at'),
        ('idempotency_commands','id'),
        ('idempotency_commands','retry_count'),
        ('idempotency_commands','started_at'),
        ('idempotency_commands','updated_at'),
        ('atomic_outbox','id'),
        ('atomic_outbox','attempt_count'),
        ('atomic_outbox','retry_count'),
        ('atomic_outbox','execution_status'),
        ('atomic_outbox','next_attempt_at'),
        ('atomic_outbox','created_at'),
        ('atomic_outbox','updated_at')
      )
  ) then
    raise exception 'SCHEMA_DRIFT: unexpected default on a Core V2 table column';
  end if;

  for r in
    select *
    from (values
      ('financial_quotes',array[
        'branch_id','correlation_id','created_at','created_by_actor_id',
        'created_by_actor_type','customer_id','discount_rule_version',
        'expires_at','financial_engine_version','id','pricing_rule_version',
        'quote_classification','quote_fingerprint','quote_hash','quote_payload',
        'quote_snapshot_version','quote_version','request_fingerprint',
        'request_fingerprint_version','rounding_version','tenant_id',
        'vat_rule_version'
      ]::text[]),
      ('idempotency_commands',array[
        'actor_id','actor_type','branch_id','command_type','committed_at',
        'correlation_id','engine_version','expires_at','failed_at',
        'fingerprint_version','id','invoice_id','key_hash','last_error_code',
        'lease_expires_at','lease_owner','order_id','recovery_completed_at',
        'recovery_started_at','request_fingerprint','response_hash',
        'response_version','retry_count','started_at','state','tenant_id',
        'updated_at'
      ]::text[]),
      ('atomic_outbox',array[
        'aggregate_id','aggregate_type','attempt_count','branch_id','created_at',
        'correlation_id','delivered_at','event_id','event_type',
        'execution_status','id','last_error_classification','last_error_code',
        'last_error_message','lease_expires_at','lease_owner','next_attempt_at',
        'payload','payload_hash','payload_version','retry_count','tenant_id',
        'updated_at'
      ]::text[])
    ) expected(table_name,column_names)
  loop
    select array_agg(a.attname order by a.attname)
    into v_actual_columns
    from pg_attribute a
    where a.attrelid = format('public.%I',r.table_name)::regclass
      and a.attnum > 0
      and not a.attisdropped;
    select array_agg(x order by x) into v_expected_columns
    from unnest(r.column_names) x;
    if v_actual_columns <> v_expected_columns then
      raise exception 'SCHEMA_DRIFT: unexpected or missing columns on public.%',
        r.table_name;
    end if;
  end loop;

  for r in
    select unnest(array[
      'financial_quotes','idempotency_commands','atomic_outbox'
    ]) as table_name
  loop
    select array(
      select a.attname
      from unnest(c.conkey) with ordinality k(attnum,ord)
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
      order by k.ord
    )
    into v_pk_columns
    from pg_constraint c
    where c.conrelid = format('public.%I',r.table_name)::regclass
      and c.contype = 'p';
    if not found or v_pk_columns <> array['id'] then
      raise exception 'SCHEMA_DRIFT: primary key for public.% differs',
        r.table_name;
    end if;
  end loop;
end;
$verify_new_table_defaults_and_primary_keys$;

-- Canonical CHECK constraints. Existing constraints are compared using a
-- whitespace/parenthesis/type-cast normalized expression and fail on drift.
do $check_constraints$
declare
  r record;
  v_existing text;
  v_expected text;
  v_validated boolean;
begin
  for r in
    select *
    from (values
      ('financial_quotes','ck_financial_quotes_request_fingerprint',
       'request_fingerprint ~ ''^[0-9a-f]{64}$''',false),
      ('financial_quotes','ck_financial_quotes_quote_fingerprint',
       'quote_fingerprint ~ ''^[0-9a-f]{64}$''',false),
      ('financial_quotes','ck_financial_quotes_quote_hash',
       'quote_hash ~ ''^[0-9a-f]{64}$''',false),
      ('financial_quotes','ck_financial_quotes_correlation_id',
       'length(correlation_id) between 1 and 128',false),
      ('financial_quotes','ck_financial_quotes_versions_nonempty',
       'length(btrim(request_fingerprint_version)) > 0 and length(btrim(quote_version)) > 0 and length(btrim(financial_engine_version)) > 0 and length(btrim(pricing_rule_version)) > 0 and length(btrim(vat_rule_version)) > 0 and length(btrim(discount_rule_version)) > 0 and length(btrim(rounding_version)) > 0 and length(btrim(quote_snapshot_version)) > 0',false),
      ('financial_quotes','ck_financial_quotes_payload_object',
       'jsonb_typeof(quote_payload) = ''object''',false),
      ('financial_quotes','ck_financial_quotes_expiry',
       'expires_at > created_at',false),
      ('financial_quotes','ck_financial_quotes_classification',
       'quote_classification = ''advisory''',false),
      ('financial_quotes','ck_financial_quotes_actor_type',
       'created_by_actor_type = any(array[''user'',''pos_employee'',''system'',''integration''])',false),
      ('idempotency_commands','ck_idempotency_commands_key_hash',
       'key_hash ~ ''^[0-9a-f]{64}$''',false),
      ('idempotency_commands','ck_idempotency_commands_request_fingerprint',
       'request_fingerprint ~ ''^[0-9a-f]{64}$''',false),
      ('idempotency_commands','ck_idempotency_commands_response_hash',
       'response_hash is null or response_hash ~ ''^[0-9a-f]{64}$''',false),
      ('idempotency_commands','ck_idempotency_commands_state',
       'state = any(array[''started'',''committed'',''failed_retryable'',''failed_terminal'',''expired''])',false),
      ('idempotency_commands','ck_idempotency_commands_actor_type',
       'actor_type = any(array[''user'',''pos_employee'',''system'',''integration''])',false),
      ('idempotency_commands','ck_idempotency_commands_retry_count',
       'retry_count >= 0',false),
      ('idempotency_commands','ck_idempotency_commands_correlation_id',
       'length(correlation_id) between 1 and 128',false),
      ('idempotency_commands','ck_idempotency_commands_nonempty_identity',
       'length(btrim(command_type)) > 0 and length(btrim(fingerprint_version)) > 0 and length(btrim(engine_version)) > 0 and (lease_owner is null or length(btrim(lease_owner)) > 0) and (response_version is null or length(btrim(response_version)) > 0)',false),
      ('idempotency_commands','ck_idempotency_commands_started_state',
       'state <> ''started'' or (lease_owner is not null and lease_expires_at is not null and committed_at is null)',false),
      ('idempotency_commands','ck_idempotency_commands_committed_state',
       'state <> ''committed'' or (order_id is not null and invoice_id is not null and response_version is not null and response_hash is not null and committed_at is not null and lease_owner is null and lease_expires_at is null and failed_at is null)',false),
      ('idempotency_commands','ck_idempotency_commands_failed_state',
       'state <> all(array[''failed_retryable'',''failed_terminal'']) or failed_at is not null',false),
      ('idempotency_commands','ck_idempotency_commands_expired_state',
       'state <> ''expired'' or expires_at is not null',false),
      ('idempotency_commands','ck_idempotency_commands_recovery_order',
       'recovery_completed_at is null or (recovery_started_at is not null and recovery_completed_at >= recovery_started_at)',false),
      ('atomic_outbox','ck_atomic_outbox_event_type',
       'event_type = any(array[''invoice_created'',''inventory_changed'',''customer_created'',''pdf_generate'',''whatsapp_send'',''email_send'',''loyalty_update'',''analytics_publish'',''webhook_dispatch''])',false),
      ('atomic_outbox','ck_atomic_outbox_aggregate_type',
       'aggregate_type = any(array[''order'',''invoice'',''customer'',''inventory''])',false),
      ('atomic_outbox','ck_atomic_outbox_execution_status',
       'execution_status = any(array[''pending_commit'',''processing'',''delivered'',''retryable'',''dead_letter'',''cancelled''])',false),
      ('atomic_outbox','ck_atomic_outbox_payload_object',
       'jsonb_typeof(payload) = ''object''',false),
      ('atomic_outbox','ck_atomic_outbox_payload_hash',
       'payload_hash ~ ''^[0-9a-f]{64}$''',false),
      ('atomic_outbox','ck_atomic_outbox_counts',
       'attempt_count >= 0 and retry_count >= 0',false),
      ('atomic_outbox','ck_atomic_outbox_correlation_id',
       'length(correlation_id) between 1 and 128',false),
      ('atomic_outbox','ck_atomic_outbox_payload_version',
       'length(btrim(payload_version)) > 0',false),
      ('atomic_outbox','ck_atomic_outbox_bounded_text',
       '(lease_owner is null or length(lease_owner) between 1 and 128) and (last_error_code is null or length(last_error_code) <= 128) and (last_error_classification is null or length(last_error_classification) <= 128) and (last_error_message is null or length(last_error_message) <= 2000)',false),
      ('atomic_outbox','ck_atomic_outbox_processing_lease',
       'execution_status <> ''processing'' or (lease_owner is not null and lease_expires_at is not null)',false),
      ('atomic_outbox','ck_atomic_outbox_nonprocessing_lease',
       'execution_status = ''processing'' or lease_owner is null',false),
      ('atomic_outbox','ck_atomic_outbox_delivered_at',
       'execution_status <> ''delivered'' or delivered_at is not null',false),
      ('atomic_outbox','ck_atomic_outbox_terminal_lease',
       'execution_status <> all(array[''delivered'',''dead_letter'',''cancelled'']) or lease_expires_at is null',false),
      ('atomic_outbox','ck_atomic_outbox_next_attempt',
       'execution_status <> all(array[''pending_commit'',''retryable'']) or next_attempt_at is not null',false),
      ('customers','ck_customers_phone_normalized',
       'phone_normalized is null or phone_normalized ~ ''^9665[0-9]{8}$''',true),
      ('customers','ck_customers_record_version',
       'record_version is null or record_version >= 1',true),
      ('orders','ck_orders_correlation_id',
       'correlation_id is null or length(correlation_id) between 1 and 128',true),
      ('orders','ck_orders_customer_record_version_snapshot',
       'customer_record_version_snapshot is null or customer_record_version_snapshot >= 1',true),
      ('orders','ck_orders_engine_versions',
       '(atomic_engine_version is null or atomic_engine_version = ''atomic-order-v2-r1'') and (financial_engine_version is null or length(btrim(financial_engine_version)) > 0) and (source_channel is null or length(btrim(source_channel)) > 0)',true),
      ('orders','ck_orders_core_v2_complete',
       'atomic_engine_version is distinct from ''atomic-order-v2-r1'' or (idempotency_command_id is not null and correlation_id is not null and source_channel is not null and financial_engine_version is not null and customer_name_snapshot is not null and customer_phone_snapshot is not null and customer_record_version_snapshot >= 1)',true),
      ('invoices','ck_invoices_currency_code',
       'currency_code is null or currency_code ~ ''^[A-Z]{3}$''',true),
      ('invoices','ck_invoices_financial_nonnegative',
       '(discount_value_snapshot is null or discount_value_snapshot >= 0) and (discount_amount is null or discount_amount >= 0) and (taxable_subtotal is null or taxable_subtotal >= 0) and (vat_amount is null or vat_amount >= 0)',true),
      ('invoices','ck_invoices_vat_rate',
       'vat_rate_snapshot is null or (vat_rate_snapshot >= 0 and vat_rate_snapshot <= 100)',true),
      ('invoices','ck_invoices_request_fingerprint',
       'request_fingerprint is null or request_fingerprint ~ ''^[0-9a-f]{64}$''',true),
      ('invoices','ck_invoices_quote_fingerprint',
       'quote_fingerprint is null or quote_fingerprint ~ ''^[0-9a-f]{64}$''',true),
      ('invoices','ck_invoices_financial_snapshot_hash',
       'financial_snapshot_hash is null or financial_snapshot_hash ~ ''^[0-9a-f]{64}$''',true),
      ('invoices','ck_invoices_completeness_reasons',
       'financial_completeness_reasons is null or jsonb_typeof(financial_completeness_reasons) = ''array''',true),
      ('invoices','ck_invoices_customer_record_version_snapshot',
       'customer_record_version_snapshot is null or customer_record_version_snapshot >= 1',true),
      ('invoices','ck_invoices_correlation_id',
       'correlation_id is null or length(correlation_id) between 1 and 128',true),
      ('invoices','ck_invoices_payment_snapshot',
       'payment_snapshot is null or jsonb_typeof(payment_snapshot) = ''object''',true),
      ('invoices','ck_invoices_engine_versions',
       '(atomic_engine_version is null or atomic_engine_version = ''atomic-order-v2-r1'') and (financial_engine_version is null or length(btrim(financial_engine_version)) > 0)',true),
      ('invoices','ck_invoices_core_v2_complete',
       'atomic_engine_version is distinct from ''atomic-order-v2-r1'' or (currency_code is not null and request_fingerprint is not null and request_fingerprint_version is not null and quote_fingerprint is not null and quote_version is not null and financial_engine_version is not null and pricing_rule_version is not null and vat_rule_version is not null and discount_rule_version is not null and rounding_version is not null and financial_snapshot_version is not null and financial_snapshot_hash is not null and financial_snapshot_complete is true and financial_quote_id is not null and payment_snapshot is not null and customer_name_snapshot is not null and customer_phone_snapshot is not null and customer_record_version_snapshot >= 1 and correlation_id is not null and financial_record_classification is not null)',true),
      ('invoice_items','ck_invoice_items_line_number',
       'line_number is null or line_number > 0',true),
      ('invoice_items','ck_invoice_items_financial_nonnegative',
       '(gross_amount is null or gross_amount >= 0) and (discount_allocation is null or discount_allocation >= 0) and (taxable_amount is null or taxable_amount >= 0) and (cost_snapshot is null or cost_snapshot >= 0)',true),
      ('invoice_items','ck_invoice_items_discount_allocation',
       'gross_amount is null or discount_allocation is null or discount_allocation <= gross_amount',true),
      ('invoice_items','ck_invoice_items_taxable_amount',
       'gross_amount is null or discount_allocation is null or taxable_amount is null or taxable_amount = round(gross_amount - discount_allocation,2)',true),
      ('invoice_items','ck_invoice_items_price_source',
       'price_source is null or price_source = any(array[''catalog'',''branch_override''])',true),
      ('invoice_items','ck_invoice_items_cost_status',
       'cost_snapshot_status is null or cost_snapshot_status = any(array[''complete'',''missing'',''unavailable'',''not_applicable''])',true),
      ('invoice_items','ck_invoice_items_tracking_mode',
       'inventory_tracking_mode is null or inventory_tracking_mode = any(array[''tracked_product'',''untracked_product'',''service''])',true),
      ('invoice_items','ck_invoice_items_correlation_id',
       'inventory_movement_correlation_id is null or length(inventory_movement_correlation_id) between 1 and 128',true),
      ('inventory_stock','ck_inventory_stock_record_version',
       'record_version is null or record_version >= 1',true),
      ('inventory_movements','ck_inventory_movements_quantities',
       '(quantity_before is null or quantity_before >= 0) and (quantity_after is null or quantity_after >= 0) and (quantity_before is null or quantity_after is null or quantity_after = quantity_before + quantity_delta)',true),
      ('inventory_movements','ck_inventory_movements_versions',
       '(stock_version_before is null or stock_version_before >= 1) and (stock_version_after is null or stock_version_after >= 1) and (stock_version_before is null or stock_version_after is null or stock_version_after = stock_version_before + 1)',true),
      ('inventory_movements','ck_inventory_movements_snapshot_hash',
       'inventory_snapshot_hash is null or inventory_snapshot_hash ~ ''^[0-9a-f]{64}$''',true),
      ('inventory_movements','ck_inventory_movements_correlation_id',
       'correlation_id is null or length(correlation_id) between 1 and 128',true),
      ('inventory_movements','ck_inventory_movements_engine_version',
       'inventory_engine_version is null or inventory_engine_version = ''inventory-engine-v2-r1''',true),
      ('inventory_movements','ck_inventory_movements_core_v2_complete',
       'inventory_engine_version is distinct from ''inventory-engine-v2-r1'' or (movement_reason is not null and quantity_before is not null and quantity_after is not null and stock_version_before >= 1 and stock_version_after = stock_version_before + 1 and invoice_id is not null and invoice_item_id is not null and correlation_id is not null and inventory_snapshot_version is not null and inventory_snapshot_hash is not null)',true),
      ('audit_logs','ck_audit_logs_request_fingerprint',
       'request_fingerprint is null or request_fingerprint ~ ''^[0-9a-f]{64}$''',true),
      ('audit_logs','ck_audit_logs_quote_fingerprint',
       'quote_fingerprint is null or quote_fingerprint ~ ''^[0-9a-f]{64}$''',true),
      ('audit_logs','ck_audit_logs_correlation_id',
       'correlation_id is null or length(correlation_id) between 1 and 128',true),
      ('audit_logs','ck_audit_logs_snapshots',
       '(before_snapshot is null or jsonb_typeof(before_snapshot) = ''object'') and (after_snapshot is null or jsonb_typeof(after_snapshot) = ''object'')',true),
      ('audit_logs','ck_audit_logs_schema_version',
       'audit_schema_version is null or length(btrim(audit_schema_version)) > 0',true)
    ) expected(table_name,constraint_name,expression,not_valid)
  loop
    select
      regexp_replace(
        replace(replace(replace(replace(replace(
          lower(pg_get_expr(c.conbin,c.conrelid)),
          '::text',''),'::numeric',''),'::integer',''),
          '::bigint',''),'::boolean',''),
        '[[:space:]()]','','g'
      ),
      c.convalidated
    into v_existing, v_validated
    from pg_constraint c
    where c.conrelid = format('public.%I',r.table_name)::regclass
      and c.conname = r.constraint_name
      and c.contype = 'c';

    v_expected := regexp_replace(
      replace(replace(replace(replace(replace(
        lower(r.expression),
        '::text',''),'::numeric',''),'::integer',''),
        '::bigint',''),'::boolean',''),
      '[[:space:]()]','','g'
    );

    if not found then
      execute format(
        'alter table public.%I add constraint %I check (%s)%s',
        r.table_name, r.constraint_name, r.expression,
        case when r.not_valid then ' not valid' else '' end
      );
    elsif v_existing <> v_expected then
      raise exception 'SCHEMA_DRIFT: check constraint %.% differs', r.table_name, r.constraint_name;
    end if;
  end loop;
end;
$check_constraints$;

-- Canonical foreign keys. New-table FKs are immediate; existing-table FKs are
-- NOT VALID. All use NO ACTION and no financial/audit cascade.
do $foreign_keys$
declare
  r record;
  v_ok boolean;
begin
  for r in
    select *
    from (values
      ('financial_quotes','fk_financial_quotes_tenants','tenant_id','tenants','id',false),
      ('financial_quotes','fk_financial_quotes_branches','branch_id','branches','id',false),
      ('financial_quotes','fk_financial_quotes_customers','customer_id','customers','id',false),
      ('idempotency_commands','fk_idempotency_commands_tenants','tenant_id','tenants','id',false),
      ('idempotency_commands','fk_idempotency_commands_branches','branch_id','branches','id',false),
      ('idempotency_commands','fk_idempotency_commands_orders','order_id','orders','id',false),
      ('idempotency_commands','fk_idempotency_commands_invoices','invoice_id','invoices','id',false),
      ('atomic_outbox','fk_atomic_outbox_tenants','tenant_id','tenants','id',false),
      ('atomic_outbox','fk_atomic_outbox_branches','branch_id','branches','id',false),
      ('orders','fk_orders_idempotency_commands','idempotency_command_id','idempotency_commands','id',true),
      ('invoices','fk_invoices_financial_quotes','financial_quote_id','financial_quotes','id',true),
      ('inventory_movements','fk_inventory_movements_orders','order_id','orders','id',true),
      ('inventory_movements','fk_inventory_movements_invoices','invoice_id','invoices','id',true),
      ('inventory_movements','fk_inventory_movements_invoice_items','invoice_item_id','invoice_items','id',true),
      ('audit_logs','fk_audit_logs_orders','order_id','orders','id',true),
      ('audit_logs','fk_audit_logs_invoices','invoice_id','invoices','id',true),
      ('audit_logs','fk_audit_logs_customers','customer_id','customers','id',true)
    ) expected(from_table,constraint_name,from_column,to_table,to_column,not_valid)
  loop
    select
      c.confrelid = format('public.%I',r.to_table)::regclass
      and c.confdeltype = 'a'
      and c.confupdtype = 'a'
      and array(
        select a.attname
        from unnest(c.conkey) with ordinality k(attnum,ord)
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
        order by k.ord
      ) = array[r.from_column]
      and array(
        select a.attname
        from unnest(c.confkey) with ordinality k(attnum,ord)
        join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.attnum
        order by k.ord
      ) = array[r.to_column]
      and c.convalidated = not r.not_valid
    into v_ok
    from pg_constraint c
    where c.conrelid = format('public.%I',r.from_table)::regclass
      and c.conname = r.constraint_name
      and c.contype = 'f';

    if not found then
      execute format(
        'alter table public.%I add constraint %I foreign key (%I) references public.%I(%I) on update no action on delete no action%s',
        r.from_table, r.constraint_name, r.from_column,
        r.to_table, r.to_column,
        case when r.not_valid then ' not valid' else '' end
      );
    elsif not v_ok then
      raise exception 'SCHEMA_DRIFT: foreign key %.% differs', r.from_table, r.constraint_name;
    end if;
  end loop;
end;
$foreign_keys$;

-- Event UUID uniqueness is structural. Semantic event deduplication remains an
-- invariant of the atomic transaction because no universally stable semantic
-- key exists for every approved event type.
do $unique_constraint$
declare
  v_ok boolean;
begin
  select c.contype = 'u'
    and array(
      select a.attname
      from unnest(c.conkey) with ordinality k(attnum,ord)
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
      order by k.ord
    ) = array['event_id']
  into v_ok
  from pg_constraint c
  where c.conrelid = 'public.atomic_outbox'::regclass
    and c.conname = 'uq_atomic_outbox_event_id';

  if not found then
    alter table public.atomic_outbox
      add constraint uq_atomic_outbox_event_id unique (event_id);
  elsif not v_ok then
    raise exception 'SCHEMA_DRIFT: unique constraint uq_atomic_outbox_event_id differs';
  end if;
end;
$unique_constraint$;

-- Drift-safe indexes on NEW empty Core V2 tables only.
do $verify_new_table_indexes$
declare
  r record;
  x record;
  v_keys text[];
  v_predicate text;
  v_unique boolean;
  v_table regclass;
  v_valid boolean;
  v_ready boolean;
  v_access_method text;
  v_key_count integer;
  v_attribute_count integer;
  v_has_expressions boolean;
  v_default_ordering boolean;
  v_default_opclasses boolean;
  v_default_collations boolean;
  v_equivalent_names text[];
begin
  for r in
    select *
    from (values
      ('uq_financial_quotes_scope',
       'financial_quotes',true,
       array['tenant_id','branch_id','quote_fingerprint','quote_version','financial_engine_version']::text[],
       null::text),
      ('idx_financial_quotes_request_fingerprint',
       'financial_quotes',false,
       array['tenant_id','branch_id','request_fingerprint']::text[],null),
      ('idx_financial_quotes_expiry',
       'financial_quotes',false,array['expires_at']::text[],null),
      ('idx_financial_quotes_customer',
       'financial_quotes',false,array['customer_id']::text[],null),
      ('uq_idempotency_commands_scope_key',
       'idempotency_commands',true,
       array['tenant_id','branch_id','command_type','key_hash']::text[],null),
      ('idx_idempotency_commands_recovery_lease',
       'idempotency_commands',false,
       array['state','lease_expires_at','recovery_started_at']::text[],
       'state = any (array[''started''::text, ''failed_retryable''::text])'),
      ('idx_idempotency_commands_retention',
       'idempotency_commands',false,
       array['state','committed_at','failed_at','expires_at']::text[],null),
      ('idx_idempotency_commands_order',
       'idempotency_commands',false,array['order_id']::text[],null),
      ('idx_idempotency_commands_invoice',
       'idempotency_commands',false,array['invoice_id']::text[],null),
      ('idx_atomic_outbox_claim_ready',
       'atomic_outbox',false,
       array['execution_status','next_attempt_at','created_at']::text[],
       'execution_status = any (array[''pending_commit''::text, ''retryable''::text])'),
      ('idx_atomic_outbox_processing_lease',
       'atomic_outbox',false,
       array['execution_status','lease_expires_at','created_at']::text[],
       'execution_status = ''processing''::text'),
      ('idx_atomic_outbox_aggregate',
       'atomic_outbox',false,
       array['tenant_id','aggregate_type','aggregate_id','created_at']::text[],null),
      ('idx_atomic_outbox_correlation',
       'atomic_outbox',false,array['correlation_id','created_at']::text[],null)
    ) expected(index_name,table_name,is_unique,key_columns,predicate)
  loop
    v_table := null;
    v_unique := null;
    v_valid := null;
    v_ready := null;
    v_access_method := null;
    v_key_count := null;
    v_attribute_count := null;
    v_has_expressions := null;
    v_keys := null;
    v_default_ordering := null;
    v_default_opclasses := null;
    v_default_collations := null;
    v_predicate := null;
    v_equivalent_names := array[]::text[];

    for x in
      select
        c.relname as index_name,
        i.indrelid::regclass as table_name,
        i.indisunique as is_unique,
        i.indisvalid as is_valid,
        i.indisready as is_ready,
        am.amname as access_method,
        i.indnkeyatts as key_count,
        i.indnatts as attribute_count,
        i.indexprs is not null as has_expressions,
        array(
          select a.attname
          from unnest(i.indkey::smallint[]) with ordinality k(attnum,ord)
          join pg_attribute a
            on a.attrelid = i.indrelid and a.attnum = k.attnum
          where k.attnum > 0 and k.ord <= i.indnkeyatts
          order by k.ord
        ) as key_columns,
        not exists (
          select 1
          from unnest(i.indoption::smallint[]) with ordinality o(option_bits,ord)
          where o.ord <= i.indnkeyatts and o.option_bits <> 0
        ) as default_ordering,
        not exists (
          select 1
          from unnest(i.indclass::oid[]) with ordinality oc(opclass_oid,ord)
          join pg_opclass opc on opc.oid = oc.opclass_oid
          where oc.ord <= i.indnkeyatts and not opc.opcdefault
        ) as default_opclasses,
        not exists (
          select 1
          from unnest(i.indkey::smallint[],i.indcollation::oid[])
            with ordinality k(attnum,collation_oid,ord)
          join pg_attribute a
            on a.attrelid = i.indrelid and a.attnum = k.attnum
          where k.ord <= i.indnkeyatts
            and k.collation_oid <> a.attcollation
        ) as default_collations,
        pg_get_expr(i.indpred,i.indrelid) as predicate
      from pg_index i
      join pg_class c on c.oid = i.indexrelid
      join pg_class t on t.oid = i.indrelid
      join pg_namespace n on n.oid = t.relnamespace
      join pg_am am on am.oid = c.relam
      where n.nspname = 'public'
        and t.relname = r.table_name
    loop
      if x.index_name = r.index_name then
        v_table := x.table_name;
        v_unique := x.is_unique;
        v_valid := x.is_valid;
        v_ready := x.is_ready;
        v_access_method := x.access_method;
        v_key_count := x.key_count;
        v_attribute_count := x.attribute_count;
        v_has_expressions := x.has_expressions;
        v_keys := x.key_columns;
        v_default_ordering := x.default_ordering;
        v_default_opclasses := x.default_opclasses;
        v_default_collations := x.default_collations;
        v_predicate := x.predicate;
      elsif x.is_unique = r.is_unique
        and x.access_method = 'btree'
        and x.key_count = cardinality(r.key_columns)
        and x.attribute_count = x.key_count
        and not x.has_expressions
        and x.key_columns = r.key_columns
        and x.default_ordering
        and x.default_opclasses
        and x.default_collations
        and coalesce(
          regexp_replace(replace(lower(x.predicate),'::text',''),
            '[[:space:]()]','','g'),''
        ) = coalesce(
          regexp_replace(replace(lower(r.predicate),'::text',''),
            '[[:space:]()]','','g'),''
        )
      then
        v_equivalent_names := array_append(
          v_equivalent_names,
          format('%I(valid=%s,ready=%s)',x.index_name,x.is_valid,x.is_ready)
        );
      end if;
    end loop;

    if v_table is not null and (
      v_table <> format('public.%I',r.table_name)::regclass
      or v_unique <> r.is_unique
      or not v_valid
      or not v_ready
      or v_access_method <> 'btree'
      or v_key_count <> cardinality(r.key_columns)
      or v_attribute_count <> v_key_count
      or v_has_expressions
      or v_keys <> r.key_columns
      or not v_default_ordering
      or not v_default_opclasses
      or not v_default_collations
      or coalesce(
        regexp_replace(replace(lower(v_predicate),'::text',''),
          '[[:space:]()]','','g'),''
      ) <> coalesce(
        regexp_replace(replace(lower(r.predicate),'::text',''),
          '[[:space:]()]','','g'),''
      )
    ) then
      raise exception using
        message = format(
          'INDEX_DRIFT: canonical index %s is invalid, not ready, or differs',
          r.index_name
        ),
        hint = 'STOP. Inspect pg_index/pg_get_indexdef; do not DROP or rebuild automatically.';
    end if;

    if cardinality(v_equivalent_names) > 0 then
      raise exception using
        message = format(
          'INDEX_EQUIVALENT_NAME_CONFLICT: canonical index %s has alternate equivalent(s): %s',
          r.index_name,
          array_to_string(v_equivalent_names,', ')
        ),
        hint = 'The Package 2R contract is canonical-name based. STOP for external review; do not create a duplicate or rename/drop automatically.';
    end if;
  end loop;
end;
$verify_new_table_indexes$;

create unique index if not exists uq_financial_quotes_scope
  on public.financial_quotes (
    tenant_id, branch_id, quote_fingerprint,
    quote_version, financial_engine_version
  );
create index if not exists idx_financial_quotes_request_fingerprint
  on public.financial_quotes (tenant_id, branch_id, request_fingerprint);
create index if not exists idx_financial_quotes_expiry
  on public.financial_quotes (expires_at);
create index if not exists idx_financial_quotes_customer
  on public.financial_quotes (customer_id);

create unique index if not exists uq_idempotency_commands_scope_key
  on public.idempotency_commands (
    tenant_id, branch_id, command_type, key_hash
  );
create index if not exists idx_idempotency_commands_recovery_lease
  on public.idempotency_commands (
    state, lease_expires_at, recovery_started_at
  )
  where state in ('started','failed_retryable');
create index if not exists idx_idempotency_commands_retention
  on public.idempotency_commands (
    state, committed_at, failed_at, expires_at
  );
create index if not exists idx_idempotency_commands_order
  on public.idempotency_commands (order_id);
create index if not exists idx_idempotency_commands_invoice
  on public.idempotency_commands (invoice_id);

create index if not exists idx_atomic_outbox_claim_ready
  on public.atomic_outbox (
    execution_status, next_attempt_at, created_at
  )
  where execution_status in ('pending_commit','retryable');
create index if not exists idx_atomic_outbox_processing_lease
  on public.atomic_outbox (
    execution_status, lease_expires_at, created_at
  )
  where execution_status = 'processing';
create index if not exists idx_atomic_outbox_aggregate
  on public.atomic_outbox (
    tenant_id, aggregate_type, aggregate_id, created_at
  );
create index if not exists idx_atomic_outbox_correlation
  on public.atomic_outbox (correlation_id, created_at);

/*
Cross-table invoice_number = order_number cannot be represented safely by a
PostgreSQL CHECK constraint. It remains an invariant of Package 4, Package 6
trigger coexistence and Package 7 verification.

Invoice-item Core V2 completeness depends on the parent invoice engine marker.
CHECK constraints cannot contain parent-table subqueries, so that invariant
remains enforced by Package 4 and verified by Package 7.
*/

commit;
