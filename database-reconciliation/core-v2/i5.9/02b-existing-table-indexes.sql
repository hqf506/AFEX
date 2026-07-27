/*
AFEX Core V2 I5.9 — Package 2B-R: Existing-table Concurrent Indexes
Purpose: add the 14 reviewed supporting indexes to existing hot tables without
placing CREATE INDEX CONCURRENTLY inside an explicit transaction.
Dependencies: Package 2R columns exist; Package 1R drift evidence is approved.
Boundary: no DML, backfill, functions, triggers, RLS, grants or activation.
The final unique customer identity index remains deferred to Package 3R.

MANUAL EXECUTION CONTRACT
-------------------------
1. Run Section A alone. Continue only when it emits PRECHECK_CREATE_REQUIRED.
2. Run Section B alone. Every CREATE INDEX CONCURRENTLY is intentionally free
   of IF NOT EXISTS. Any unexpected object causes PostgreSQL to stop.
3. Run Section C alone and require POSTCHECK_PASS.
4. On any error STOP. Never continue, DROP, rename, rebuild or repair
   automatically. A valid equivalent under another name is a conflict because
   downstream foundation attestation requires the canonical names.
*/

/* SECTION A — READ-ONLY PRECHECK. */
do $package2b_index_precheck$
declare
  r record;
  x record;
  v_canonical_found boolean;
  v_canonical_exact boolean;
  v_canonical_valid boolean;
  v_canonical_ready boolean;
  v_equivalent_names text[];
begin
  for r in
    select *
    from (values
      ('idx_customers_tenant_phone_normalized','customers',false,
       array['tenant_id','phone_normalized']::text[],
       'phone_normalized is not null'),
      ('idx_orders_idempotency_command','orders',false,
       array['idempotency_command_id']::text[],
       'idempotency_command_id is not null'),
      ('idx_orders_correlation','orders',false,
       array['correlation_id']::text[],'correlation_id is not null'),
      ('idx_invoices_financial_quote','invoices',false,
       array['financial_quote_id']::text[],
       'financial_quote_id is not null'),
      ('idx_invoices_request_fingerprint','invoices',false,
       array['tenant_id','request_fingerprint']::text[],
       'request_fingerprint is not null'),
      ('idx_invoices_quote_fingerprint','invoices',false,
       array['tenant_id','quote_fingerprint']::text[],
       'quote_fingerprint is not null'),
      ('idx_inventory_movements_order','inventory_movements',false,
       array['order_id']::text[],'order_id is not null'),
      ('idx_inventory_movements_invoice','inventory_movements',false,
       array['invoice_id']::text[],'invoice_id is not null'),
      ('idx_inventory_movements_invoice_item','inventory_movements',false,
       array['invoice_item_id']::text[],'invoice_item_id is not null'),
      ('idx_inventory_movements_correlation','inventory_movements',false,
       array['tenant_id','correlation_id','created_at']::text[],
       'correlation_id is not null'),
      ('idx_audit_logs_order','audit_logs',false,
       array['order_id']::text[],'order_id is not null'),
      ('idx_audit_logs_invoice','audit_logs',false,
       array['invoice_id']::text[],'invoice_id is not null'),
      ('idx_audit_logs_customer','audit_logs',false,
       array['customer_id']::text[],'customer_id is not null'),
      ('idx_audit_logs_correlation','audit_logs',false,
       array['tenant_id','correlation_id','created_at']::text[],
       'correlation_id is not null')
    ) expected(index_name,table_name,is_unique,key_columns,predicate)
  loop
    v_canonical_found := false;
    v_canonical_exact := false;
    v_canonical_valid := false;
    v_canonical_ready := false;
    v_equivalent_names := array[]::text[];

    if to_regclass(format('public.%I',r.table_name)) is null then
      raise exception 'PACKAGE_2B_REQUIRED_TABLE_MISSING: public.%',r.table_name;
    end if;

    for x in
      select
        c.relname as index_name,
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
            on a.attrelid=i.indrelid and a.attnum=k.attnum
          where k.attnum>0 and k.ord<=i.indnkeyatts
          order by k.ord
        ) as key_columns,
        not exists (
          select 1
          from unnest(i.indoption::smallint[]) with ordinality o(bits,ord)
          where o.ord<=i.indnkeyatts and o.bits<>0
        ) as default_ordering,
        not exists (
          select 1
          from unnest(i.indclass::oid[]) with ordinality oc(opclass_oid,ord)
          join pg_opclass opc on opc.oid=oc.opclass_oid
          where oc.ord<=i.indnkeyatts and not opc.opcdefault
        ) as default_opclasses,
        not exists (
          select 1
          from unnest(i.indkey::smallint[],i.indcollation::oid[])
            with ordinality k(attnum,collation_oid,ord)
          join pg_attribute a
            on a.attrelid=i.indrelid and a.attnum=k.attnum
          where k.ord<=i.indnkeyatts
            and k.collation_oid<>a.attcollation
        ) as default_collations,
        pg_get_expr(i.indpred,i.indrelid) as predicate
      from pg_index i
      join pg_class c on c.oid=i.indexrelid
      join pg_class t on t.oid=i.indrelid
      join pg_namespace n on n.oid=t.relnamespace
      join pg_am am on am.oid=c.relam
      where n.nspname='public' and t.relname=r.table_name
    loop
      if x.index_name=r.index_name then
        v_canonical_found := true;
        v_canonical_valid := x.is_valid;
        v_canonical_ready := x.is_ready;
        v_canonical_exact :=
          x.is_unique=r.is_unique
          and x.access_method='btree'
          and x.key_count=cardinality(r.key_columns)
          and x.attribute_count=x.key_count
          and not x.has_expressions
          and x.key_columns=r.key_columns
          and x.default_ordering
          and x.default_opclasses
          and x.default_collations
          and coalesce(
            regexp_replace(replace(lower(x.predicate),'::text',''),
              '[[:space:]()]','','g'),''
          )=coalesce(
            regexp_replace(replace(lower(r.predicate),'::text',''),
              '[[:space:]()]','','g'),''
          );
      elsif
        x.is_unique=r.is_unique
        and x.access_method='btree'
        and x.key_count=cardinality(r.key_columns)
        and x.attribute_count=x.key_count
        and not x.has_expressions
        and x.key_columns=r.key_columns
        and x.default_ordering
        and x.default_opclasses
        and x.default_collations
        and coalesce(
          regexp_replace(replace(lower(x.predicate),'::text',''),
            '[[:space:]()]','','g'),''
        )=coalesce(
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

    if v_canonical_found then
      if not v_canonical_exact or not v_canonical_valid or not v_canonical_ready then
        raise exception using
          message=format(
            'PACKAGE_2B_CANONICAL_INDEX_CONFLICT: %s exact=%s valid=%s ready=%s',
            r.index_name,v_canonical_exact,v_canonical_valid,v_canonical_ready
          ),
          hint='STOP for external review. Do not DROP or rebuild automatically.';
      end if;
      raise exception using
        message=format(
          'PACKAGE_2B_CANONICAL_INDEX_ALREADY_PRESENT: %s is exact, valid and ready',
          r.index_name
        ),
        hint='STOP. Section B is first-install only; obtain approval before resuming at a later manual section.';
    end if;

    if cardinality(v_equivalent_names)>0 then
      raise exception using
        message=format(
          'PACKAGE_2B_EQUIVALENT_INDEX_NAME_CONFLICT: %s alternate(s): %s',
          r.index_name,array_to_string(v_equivalent_names,', ')
        ),
        hint='Canonical names are required by foundation attestation. STOP; do not create a duplicate or rename/drop automatically.';
    end if;
  end loop;

  raise notice
    'PRECHECK_CREATE_REQUIRED: all 14 canonical names are absent and no equivalent or conflicting indexes exist';
end;
$package2b_index_precheck$;

-- STOP A. Continue only after reviewing PRECHECK_CREATE_REQUIRED.

/* SECTION B — FIRST-INSTALL CONCURRENT BUILDS; NO EXPLICIT TRANSACTION. */
create index concurrently idx_customers_tenant_phone_normalized
  on public.customers (tenant_id,phone_normalized)
  where phone_normalized is not null;
-- STOP B1 and verify the command succeeded before B2.
create index concurrently idx_orders_idempotency_command
  on public.orders (idempotency_command_id)
  where idempotency_command_id is not null;
-- STOP B2 and verify the command succeeded before B3.
create index concurrently idx_orders_correlation
  on public.orders (correlation_id)
  where correlation_id is not null;
-- STOP B3 and verify the command succeeded before B4.
create index concurrently idx_invoices_financial_quote
  on public.invoices (financial_quote_id)
  where financial_quote_id is not null;
-- STOP B4 and verify the command succeeded before B5.
create index concurrently idx_invoices_request_fingerprint
  on public.invoices (tenant_id,request_fingerprint)
  where request_fingerprint is not null;
-- STOP B5 and verify the command succeeded before B6.
create index concurrently idx_invoices_quote_fingerprint
  on public.invoices (tenant_id,quote_fingerprint)
  where quote_fingerprint is not null;
-- STOP B6 and verify the command succeeded before B7.
create index concurrently idx_inventory_movements_order
  on public.inventory_movements (order_id)
  where order_id is not null;
-- STOP B7 and verify the command succeeded before B8.
create index concurrently idx_inventory_movements_invoice
  on public.inventory_movements (invoice_id)
  where invoice_id is not null;
-- STOP B8 and verify the command succeeded before B9.
create index concurrently idx_inventory_movements_invoice_item
  on public.inventory_movements (invoice_item_id)
  where invoice_item_id is not null;
-- STOP B9 and verify the command succeeded before B10.
create index concurrently idx_inventory_movements_correlation
  on public.inventory_movements (tenant_id,correlation_id,created_at)
  where correlation_id is not null;
-- STOP B10 and verify the command succeeded before B11.
create index concurrently idx_audit_logs_order
  on public.audit_logs (order_id)
  where order_id is not null;
-- STOP B11 and verify the command succeeded before B12.
create index concurrently idx_audit_logs_invoice
  on public.audit_logs (invoice_id)
  where invoice_id is not null;
-- STOP B12 and verify the command succeeded before B13.
create index concurrently idx_audit_logs_customer
  on public.audit_logs (customer_id)
  where customer_id is not null;
-- STOP B13 and verify the command succeeded before B14.
create index concurrently idx_audit_logs_correlation
  on public.audit_logs (tenant_id,correlation_id,created_at)
  where correlation_id is not null;

-- STOP B. Do not continue if any concurrent build failed.

/* SECTION C — READ-ONLY EXACT POSTCHECK. */
do $package2b_index_postcheck$
declare
  r record;
  v_exact boolean;
  v_equivalent_names text;
begin
  for r in
    select *
    from (values
      ('idx_customers_tenant_phone_normalized','customers',array['tenant_id','phone_normalized']::text[],'phone_normalized is not null'),
      ('idx_orders_idempotency_command','orders',array['idempotency_command_id']::text[],'idempotency_command_id is not null'),
      ('idx_orders_correlation','orders',array['correlation_id']::text[],'correlation_id is not null'),
      ('idx_invoices_financial_quote','invoices',array['financial_quote_id']::text[],'financial_quote_id is not null'),
      ('idx_invoices_request_fingerprint','invoices',array['tenant_id','request_fingerprint']::text[],'request_fingerprint is not null'),
      ('idx_invoices_quote_fingerprint','invoices',array['tenant_id','quote_fingerprint']::text[],'quote_fingerprint is not null'),
      ('idx_inventory_movements_order','inventory_movements',array['order_id']::text[],'order_id is not null'),
      ('idx_inventory_movements_invoice','inventory_movements',array['invoice_id']::text[],'invoice_id is not null'),
      ('idx_inventory_movements_invoice_item','inventory_movements',array['invoice_item_id']::text[],'invoice_item_id is not null'),
      ('idx_inventory_movements_correlation','inventory_movements',array['tenant_id','correlation_id','created_at']::text[],'correlation_id is not null'),
      ('idx_audit_logs_order','audit_logs',array['order_id']::text[],'order_id is not null'),
      ('idx_audit_logs_invoice','audit_logs',array['invoice_id']::text[],'invoice_id is not null'),
      ('idx_audit_logs_customer','audit_logs',array['customer_id']::text[],'customer_id is not null'),
      ('idx_audit_logs_correlation','audit_logs',array['tenant_id','correlation_id','created_at']::text[],'correlation_id is not null')
    ) expected(index_name,table_name,key_columns,predicate)
  loop
    select
      i.indrelid=format('public.%I',r.table_name)::regclass
      and not i.indisunique
      and i.indisvalid
      and i.indisready
      and am.amname='btree'
      and i.indnkeyatts=cardinality(r.key_columns)
      and i.indnatts=i.indnkeyatts
      and i.indexprs is null
      and array(
        select a.attname
        from unnest(i.indkey::smallint[]) with ordinality k(attnum,ord)
        join pg_attribute a
          on a.attrelid=i.indrelid and a.attnum=k.attnum
        where k.attnum>0 and k.ord<=i.indnkeyatts
        order by k.ord
      )=r.key_columns
      and not exists (
        select 1
        from unnest(i.indoption::smallint[]) with ordinality o(bits,ord)
        where o.ord<=i.indnkeyatts and o.bits<>0
      )
      and not exists (
        select 1
        from unnest(i.indclass::oid[]) with ordinality oc(opclass_oid,ord)
        join pg_opclass opc on opc.oid=oc.opclass_oid
        where oc.ord<=i.indnkeyatts and not opc.opcdefault
      )
      and not exists (
        select 1
        from unnest(i.indkey::smallint[],i.indcollation::oid[])
          with ordinality k(attnum,collation_oid,ord)
        join pg_attribute a
          on a.attrelid=i.indrelid and a.attnum=k.attnum
        where k.ord<=i.indnkeyatts
          and k.collation_oid<>a.attcollation
      )
      and coalesce(
        regexp_replace(replace(lower(pg_get_expr(i.indpred,i.indrelid)),'::text',''),
          '[[:space:]()]','','g'),''
      )=coalesce(
        regexp_replace(replace(lower(r.predicate),'::text',''),
          '[[:space:]()]','','g'),''
      )
    into v_exact
    from pg_index i
    join pg_class c on c.oid=i.indexrelid
    join pg_namespace n on n.oid=c.relnamespace
    join pg_am am on am.oid=c.relam
    where n.nspname='public' and c.relname=r.index_name;

    if not found or not coalesce(v_exact,false) then
      raise exception using
        message=format(
          'PACKAGE_2B_POSTCHECK_FAILED: %s is missing, invalid, not ready, or differs',
          r.index_name
        ),
        hint='STOP for external review. Do not DROP or rebuild automatically.';
    end if;

    select string_agg(
      format('%I(valid=%s,ready=%s)',c.relname,i.indisvalid,i.indisready),
      ', ' order by c.relname
    )
    into v_equivalent_names
    from pg_index i
    join pg_class c on c.oid=i.indexrelid
    join pg_class t on t.oid=i.indrelid
    join pg_namespace n on n.oid=t.relnamespace
    join pg_am am on am.oid=c.relam
    where n.nspname='public'
      and t.relname=r.table_name
      and c.relname<>r.index_name
      and not i.indisunique
      and am.amname='btree'
      and i.indnkeyatts=cardinality(r.key_columns)
      and i.indnatts=i.indnkeyatts
      and i.indexprs is null
      and array(
        select a.attname
        from unnest(i.indkey::smallint[]) with ordinality k(attnum,ord)
        join pg_attribute a
          on a.attrelid=i.indrelid and a.attnum=k.attnum
        where k.attnum>0 and k.ord<=i.indnkeyatts
        order by k.ord
      )=r.key_columns
      and not exists (
        select 1
        from unnest(i.indoption::smallint[]) with ordinality o(bits,ord)
        where o.ord<=i.indnkeyatts and o.bits<>0
      )
      and not exists (
        select 1
        from unnest(i.indclass::oid[]) with ordinality oc(opclass_oid,ord)
        join pg_opclass opc on opc.oid=oc.opclass_oid
        where oc.ord<=i.indnkeyatts and not opc.opcdefault
      )
      and not exists (
        select 1
        from unnest(i.indkey::smallint[],i.indcollation::oid[])
          with ordinality k(attnum,collation_oid,ord)
        join pg_attribute a
          on a.attrelid=i.indrelid and a.attnum=k.attnum
        where k.ord<=i.indnkeyatts
          and k.collation_oid<>a.attcollation
      )
      and coalesce(
        regexp_replace(replace(lower(pg_get_expr(i.indpred,i.indrelid)),'::text',''),
          '[[:space:]()]','','g'),''
      )=coalesce(
        regexp_replace(replace(lower(r.predicate),'::text',''),
          '[[:space:]()]','','g'),''
      );

    if v_equivalent_names is not null then
      raise exception using
        message=format(
          'PACKAGE_2B_POSTCHECK_EQUIVALENT_NAME_CONFLICT: %s alternate(s): %s',
          r.index_name,v_equivalent_names
        ),
        hint='STOP for external review. Do not DROP, rename or repair automatically.';
    end if;
  end loop;

  raise notice 'POSTCHECK_PASS: all 14 canonical indexes are exact, valid and ready';
end;
$package2b_index_postcheck$;
