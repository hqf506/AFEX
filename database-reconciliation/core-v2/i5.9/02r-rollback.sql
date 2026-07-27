/*
AFEX Core V2 Package 2R conservative rollback.

DO NOT EXECUTE without separate external approval.
This rollback is valid only before Package 3/backfill and before any Core V2
runtime writer or activation. It fails closed if Package 2R structures contain
data, Package 2R legacy-table columns contain values, or unexpected direct
dependencies exist.
*/

begin;

do $rollback_preflight$
declare
  r record;
  v_count bigint;
  v_unexpected text;
begin
  -- Exact new tables must exist as ordinary tables and must remain empty.
  for r in
    select * from (values
      ('financial_quotes'),
      ('idempotency_commands'),
      ('atomic_outbox')
    ) expected(table_name)
  loop
    if not exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = r.table_name
        and c.relkind = 'r'
    ) then
      raise exception 'ROLLBACK_BLOCKED: public.% is missing or is not an ordinary table',
        r.table_name;
    end if;

    execute format('select count(*) from public.%I', r.table_name)
      into v_count;
    if v_count <> 0 then
      raise exception 'ROLLBACK_BLOCKED: public.% contains % row(s)',
        r.table_name, v_count;
    end if;
  end loop;

  -- Every Package 2R legacy-table column must exist and remain unused.
  for r in
    select *
    from (values
      ('customers','phone_normalized'),
      ('customers','record_version'),
      ('orders','idempotency_command_id'),
      ('orders','correlation_id'),
      ('orders','source_channel'),
      ('orders','atomic_engine_version'),
      ('orders','financial_engine_version'),
      ('orders','customer_name_snapshot'),
      ('orders','customer_phone_snapshot'),
      ('orders','customer_record_version_snapshot'),
      ('invoices','currency_code'),
      ('invoices','discount_id_snapshot'),
      ('invoices','discount_name_snapshot'),
      ('invoices','discount_type_snapshot'),
      ('invoices','discount_value_snapshot'),
      ('invoices','discount_amount'),
      ('invoices','taxable_subtotal'),
      ('invoices','vat_setting_id_snapshot'),
      ('invoices','vat_rate_snapshot'),
      ('invoices','vat_amount'),
      ('invoices','payment_rule_version'),
      ('invoices','request_fingerprint'),
      ('invoices','request_fingerprint_version'),
      ('invoices','quote_fingerprint'),
      ('invoices','quote_version'),
      ('invoices','financial_engine_version'),
      ('invoices','pricing_rule_version'),
      ('invoices','vat_rule_version'),
      ('invoices','discount_rule_version'),
      ('invoices','rounding_version'),
      ('invoices','financial_snapshot_version'),
      ('invoices','financial_snapshot_hash'),
      ('invoices','financial_snapshot_complete'),
      ('invoices','financial_completeness_reasons'),
      ('invoices','customer_name_snapshot'),
      ('invoices','customer_phone_snapshot'),
      ('invoices','customer_email_snapshot'),
      ('invoices','customer_record_version_snapshot'),
      ('invoices','correlation_id'),
      ('invoices','financial_record_classification'),
      ('invoices','atomic_engine_version'),
      ('invoices','financial_quote_id'),
      ('invoices','payment_snapshot'),
      ('invoice_items','line_number'),
      ('invoice_items','gross_amount'),
      ('invoice_items','discount_allocation'),
      ('invoice_items','taxable_amount'),
      ('invoice_items','price_source'),
      ('invoice_items','source_branch_price_id'),
      ('invoice_items','source_catalog_updated_at'),
      ('invoice_items','source_branch_price_updated_at'),
      ('invoice_items','cost_snapshot'),
      ('invoice_items','profit_snapshot'),
      ('invoice_items','cost_snapshot_status'),
      ('invoice_items','cost_snapshot_version'),
      ('invoice_items','inventory_tracking_mode'),
      ('invoice_items','inventory_movement_correlation_id'),
      ('invoice_items','pricing_snapshot'),
      ('invoice_items','inventory_snapshot_version'),
      ('inventory_stock','record_version'),
      ('inventory_movements','movement_reason'),
      ('inventory_movements','quantity_before'),
      ('inventory_movements','quantity_after'),
      ('inventory_movements','stock_version_before'),
      ('inventory_movements','stock_version_after'),
      ('inventory_movements','order_id'),
      ('inventory_movements','invoice_id'),
      ('inventory_movements','invoice_item_id'),
      ('inventory_movements','correlation_id'),
      ('inventory_movements','inventory_engine_version'),
      ('inventory_movements','inventory_snapshot_version'),
      ('inventory_movements','inventory_snapshot_hash'),
      ('audit_logs','actor_role'),
      ('audit_logs','employee_id'),
      ('audit_logs','order_id'),
      ('audit_logs','invoice_id'),
      ('audit_logs','customer_id'),
      ('audit_logs','request_fingerprint'),
      ('audit_logs','quote_fingerprint'),
      ('audit_logs','event_type'),
      ('audit_logs','before_snapshot'),
      ('audit_logs','after_snapshot'),
      ('audit_logs','correlation_id'),
      ('audit_logs','audit_schema_version')
    ) expected(table_name,column_name)
  loop
    if not exists (
      select 1
      from pg_attribute a
      where a.attrelid = format('public.%I',r.table_name)::regclass
        and a.attname = r.column_name
        and a.attnum > 0
        and not a.attisdropped
    ) then
      raise exception 'ROLLBACK_BLOCKED: expected column public.%.% is missing',
        r.table_name, r.column_name;
    end if;

    execute format(
      'select count(*) from public.%I where %I is not null',
      r.table_name, r.column_name
    ) into v_count;
    if v_count <> 0 then
      raise exception 'ROLLBACK_BLOCKED: public.%.% contains % non-null value(s)',
        r.table_name, r.column_name, v_count;
    end if;
  end loop;

  -- No triggers or RLS policies may have been attached to Package 2R tables.
  select string_agg(format('%I.%I',n.nspname,c.relname),', ')
  into v_unexpected
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('financial_quotes','idempotency_commands','atomic_outbox')
    and not t.tgisinternal;
  if v_unexpected is not null then
    raise exception 'ROLLBACK_BLOCKED: unexpected trigger dependency on %', v_unexpected;
  end if;

  select string_agg(format('%I.%I',schemaname,tablename),', ')
  into v_unexpected
  from pg_policies
  where schemaname = 'public'
    and tablename in ('financial_quotes','idempotency_commands','atomic_outbox');
  if v_unexpected is not null then
    raise exception 'ROLLBACK_BLOCKED: unexpected RLS policy on %', v_unexpected;
  end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('financial_quotes','idempotency_commands','atomic_outbox')
      and (c.relrowsecurity or c.relforcerowsecurity)
  ) then
    raise exception 'ROLLBACK_BLOCKED: unexpected RLS state on a Package 2R table';
  end if;

  if exists (
    select 1
    from information_schema.table_privileges p
    where p.table_schema = 'public'
      and p.table_name in (
        'financial_quotes','idempotency_commands','atomic_outbox'
      )
      and p.grantee in ('PUBLIC','anon','authenticated','service_role')
  ) then
    raise exception 'ROLLBACK_BLOCKED: unexpected runtime grant on a Package 2R table';
  end if;

  -- Only the two Package 2R external FKs may reference new tables.
  select string_agg(format('%s.%I',c.conrelid::regclass,c.conname),', ')
  into v_unexpected
  from pg_constraint c
  where c.contype = 'f'
    and c.confrelid in (
      'public.financial_quotes'::regclass,
      'public.idempotency_commands'::regclass,
      'public.atomic_outbox'::regclass
    )
    and c.conname not in (
      'fk_orders_idempotency_commands',
      'fk_invoices_financial_quotes'
    );
  if v_unexpected is not null then
    raise exception 'ROLLBACK_BLOCKED: unexpected foreign key dependency: %',
      v_unexpected;
  end if;

  -- Views/materialized views must not depend on the new tables.
  select string_agg(format('%I.%I',nv.nspname,v.relname),', ')
  into v_unexpected
  from pg_depend d
  join pg_rewrite rw on rw.oid = d.objid
  join pg_class v on v.oid = rw.ev_class
  join pg_namespace nv on nv.oid = v.relnamespace
  where d.refobjid in (
      'public.financial_quotes'::regclass,
      'public.idempotency_commands'::regclass,
      'public.atomic_outbox'::regclass
    )
    and v.relkind in ('v','m');
  if v_unexpected is not null then
    raise exception 'ROLLBACK_BLOCKED: dependent view/materialized view: %',
      v_unexpected;
  end if;
end;
$rollback_preflight$;

-- Remove existing-table foreign keys created by Package 2R.
alter table public.orders
  drop constraint fk_orders_idempotency_commands;
alter table public.invoices
  drop constraint fk_invoices_financial_quotes;
alter table public.inventory_movements
  drop constraint fk_inventory_movements_orders,
  drop constraint fk_inventory_movements_invoices,
  drop constraint fk_inventory_movements_invoice_items;
alter table public.audit_logs
  drop constraint fk_audit_logs_orders,
  drop constraint fk_audit_logs_invoices,
  drop constraint fk_audit_logs_customers;

-- Remove existing-table CHECK constraints created by Package 2R.
alter table public.customers
  drop constraint ck_customers_phone_normalized,
  drop constraint ck_customers_record_version;
alter table public.orders
  drop constraint ck_orders_correlation_id,
  drop constraint ck_orders_customer_record_version_snapshot,
  drop constraint ck_orders_engine_versions,
  drop constraint ck_orders_core_v2_complete;
alter table public.invoices
  drop constraint ck_invoices_currency_code,
  drop constraint ck_invoices_financial_nonnegative,
  drop constraint ck_invoices_vat_rate,
  drop constraint ck_invoices_request_fingerprint,
  drop constraint ck_invoices_quote_fingerprint,
  drop constraint ck_invoices_financial_snapshot_hash,
  drop constraint ck_invoices_completeness_reasons,
  drop constraint ck_invoices_customer_record_version_snapshot,
  drop constraint ck_invoices_correlation_id,
  drop constraint ck_invoices_payment_snapshot,
  drop constraint ck_invoices_engine_versions,
  drop constraint ck_invoices_core_v2_complete;
alter table public.invoice_items
  drop constraint ck_invoice_items_line_number,
  drop constraint ck_invoice_items_financial_nonnegative,
  drop constraint ck_invoice_items_discount_allocation,
  drop constraint ck_invoice_items_taxable_amount,
  drop constraint ck_invoice_items_price_source,
  drop constraint ck_invoice_items_cost_status,
  drop constraint ck_invoice_items_tracking_mode,
  drop constraint ck_invoice_items_correlation_id;
alter table public.inventory_stock
  drop constraint ck_inventory_stock_record_version;
alter table public.inventory_movements
  drop constraint ck_inventory_movements_quantities,
  drop constraint ck_inventory_movements_versions,
  drop constraint ck_inventory_movements_snapshot_hash,
  drop constraint ck_inventory_movements_correlation_id,
  drop constraint ck_inventory_movements_engine_version,
  drop constraint ck_inventory_movements_core_v2_complete;
alter table public.audit_logs
  drop constraint ck_audit_logs_request_fingerprint,
  drop constraint ck_audit_logs_quote_fingerprint,
  drop constraint ck_audit_logs_correlation_id,
  drop constraint ck_audit_logs_snapshots,
  drop constraint ck_audit_logs_schema_version;

-- Remove new-table indexes explicitly before dropping the empty tables.
drop index public.uq_financial_quotes_scope;
drop index public.idx_financial_quotes_request_fingerprint;
drop index public.idx_financial_quotes_expiry;
drop index public.idx_financial_quotes_customer;
drop index public.uq_idempotency_commands_scope_key;
drop index public.idx_idempotency_commands_recovery_lease;
drop index public.idx_idempotency_commands_retention;
drop index public.idx_idempotency_commands_order;
drop index public.idx_idempotency_commands_invoice;
drop index public.idx_atomic_outbox_claim_ready;
drop index public.idx_atomic_outbox_processing_lease;
drop index public.idx_atomic_outbox_aggregate;
drop index public.idx_atomic_outbox_correlation;

-- Remove only Package 2R nullable columns from legacy tables.
alter table public.customers
  drop column phone_normalized,
  drop column record_version;
alter table public.orders
  drop column idempotency_command_id,
  drop column correlation_id,
  drop column source_channel,
  drop column atomic_engine_version,
  drop column financial_engine_version,
  drop column customer_name_snapshot,
  drop column customer_phone_snapshot,
  drop column customer_record_version_snapshot;
alter table public.invoices
  drop column currency_code,
  drop column discount_id_snapshot,
  drop column discount_name_snapshot,
  drop column discount_type_snapshot,
  drop column discount_value_snapshot,
  drop column discount_amount,
  drop column taxable_subtotal,
  drop column vat_setting_id_snapshot,
  drop column vat_rate_snapshot,
  drop column vat_amount,
  drop column payment_rule_version,
  drop column request_fingerprint,
  drop column request_fingerprint_version,
  drop column quote_fingerprint,
  drop column quote_version,
  drop column financial_engine_version,
  drop column pricing_rule_version,
  drop column vat_rule_version,
  drop column discount_rule_version,
  drop column rounding_version,
  drop column financial_snapshot_version,
  drop column financial_snapshot_hash,
  drop column financial_snapshot_complete,
  drop column financial_completeness_reasons,
  drop column customer_name_snapshot,
  drop column customer_phone_snapshot,
  drop column customer_email_snapshot,
  drop column customer_record_version_snapshot,
  drop column correlation_id,
  drop column financial_record_classification,
  drop column atomic_engine_version,
  drop column financial_quote_id,
  drop column payment_snapshot;
alter table public.invoice_items
  drop column line_number,
  drop column gross_amount,
  drop column discount_allocation,
  drop column taxable_amount,
  drop column price_source,
  drop column source_branch_price_id,
  drop column source_catalog_updated_at,
  drop column source_branch_price_updated_at,
  drop column cost_snapshot,
  drop column profit_snapshot,
  drop column cost_snapshot_status,
  drop column cost_snapshot_version,
  drop column inventory_tracking_mode,
  drop column inventory_movement_correlation_id,
  drop column pricing_snapshot,
  drop column inventory_snapshot_version;
alter table public.inventory_stock
  drop column record_version;
alter table public.inventory_movements
  drop column movement_reason,
  drop column quantity_before,
  drop column quantity_after,
  drop column stock_version_before,
  drop column stock_version_after,
  drop column order_id,
  drop column invoice_id,
  drop column invoice_item_id,
  drop column correlation_id,
  drop column inventory_engine_version,
  drop column inventory_snapshot_version,
  drop column inventory_snapshot_hash;
alter table public.audit_logs
  drop column actor_role,
  drop column employee_id,
  drop column order_id,
  drop column invoice_id,
  drop column customer_id,
  drop column request_fingerprint,
  drop column quote_fingerprint,
  drop column event_type,
  drop column before_snapshot,
  drop column after_snapshot,
  drop column correlation_id,
  drop column audit_schema_version;

-- Tables are empty and external dependencies were rejected above.
drop table public.atomic_outbox;
drop table public.idempotency_commands;
drop table public.financial_quotes;

commit;
