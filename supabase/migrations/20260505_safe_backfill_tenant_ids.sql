begin;

create extension if not exists pgcrypto;

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

alter table public.profiles
add column if not exists tenant_id uuid;

alter table public.branches
add column if not exists tenant_id uuid;

alter table public.customers
add column if not exists tenant_id uuid;

alter table public.orders
add column if not exists tenant_id uuid;

alter table public.invoices
add column if not exists tenant_id uuid;

alter table public.invoice_items
add column if not exists tenant_id uuid;

do $$
declare
  v_default_tenant_id uuid;
  v_profiles_updated integer := 0;
  v_branches_updated integer := 0;
  v_customers_updated integer := 0;
  v_orders_updated integer := 0;
  v_invoices_updated integer := 0;
  v_invoice_items_updated integer := 0;
  v_profiles_null integer := 0;
  v_branches_null integer := 0;
  v_customers_null integer := 0;
  v_orders_null integer := 0;
  v_invoices_null integer := 0;
  v_invoice_items_null integer := 0;
begin
  lock table public.tenants in share row exclusive mode;

  select id
  into v_default_tenant_id
  from public.tenants
  order by created_at asc, id asc
  limit 1;

  if v_default_tenant_id is null then
    insert into public.tenants (name)
    values ('Default Tenant')
    returning id into v_default_tenant_id;
  end if;

  update public.profiles
  set tenant_id = v_default_tenant_id
  where tenant_id is null;
  get diagnostics v_profiles_updated = row_count;

  update public.branches
  set tenant_id = v_default_tenant_id
  where tenant_id is null;
  get diagnostics v_branches_updated = row_count;

  update public.customers c
  set tenant_id = coalesce(
    (
      select b.tenant_id
      from public.branches b
      where b.id = c.branch_id
      limit 1
    ),
    v_default_tenant_id
  )
  where c.tenant_id is null;
  get diagnostics v_customers_updated = row_count;

  update public.orders o
  set tenant_id = coalesce(
    (
      select p.tenant_id
      from public.profiles p
      where p.id = o.created_by_employee_id
      limit 1
    ),
    (
      select b.tenant_id
      from public.branches b
      where b.id = o.branch_id
      limit 1
    ),
    (
      select c.tenant_id
      from public.customers c
      where c.id = o.customer_id
      limit 1
    ),
    v_default_tenant_id
  )
  where o.tenant_id is null;
  get diagnostics v_orders_updated = row_count;

  update public.invoices i
  set tenant_id = coalesce(
    (
      select o.tenant_id
      from public.orders o
      where o.id = i.order_id
      limit 1
    ),
    (
      select b.tenant_id
      from public.branches b
      where b.id = i.branch_id
      limit 1
    ),
    (
      select c.tenant_id
      from public.customers c
      where c.id = i.customer_id
      limit 1
    ),
    v_default_tenant_id
  )
  where i.tenant_id is null;
  get diagnostics v_invoices_updated = row_count;

  update public.invoice_items ii
  set tenant_id = coalesce(
    (
      select i.tenant_id
      from public.invoices i
      where i.id = ii.invoice_id
      limit 1
    ),
    v_default_tenant_id
  )
  where ii.tenant_id is null;
  get diagnostics v_invoice_items_updated = row_count;

  select count(*) into v_profiles_null from public.profiles where tenant_id is null;
  select count(*) into v_branches_null from public.branches where tenant_id is null;
  select count(*) into v_customers_null from public.customers where tenant_id is null;
  select count(*) into v_orders_null from public.orders where tenant_id is null;
  select count(*) into v_invoices_null from public.invoices where tenant_id is null;
  select count(*) into v_invoice_items_null from public.invoice_items where tenant_id is null;

  raise notice 'tenant backfill updated rows: profiles=%, branches=%, customers=%, orders=%, invoices=%, invoice_items=%',
    v_profiles_updated,
    v_branches_updated,
    v_customers_updated,
    v_orders_updated,
    v_invoices_updated,
    v_invoice_items_updated;

  raise notice 'tenant backfill null counts: profiles=%, branches=%, customers=%, orders=%, invoices=%, invoice_items=%',
    v_profiles_null,
    v_branches_null,
    v_customers_null,
    v_orders_null,
    v_invoices_null,
    v_invoice_items_null;

  if (
    v_profiles_null
    + v_branches_null
    + v_customers_null
    + v_orders_null
    + v_invoices_null
    + v_invoice_items_null
  ) > 0 then
    raise exception 'Tenant backfill failed: one or more target tables still contain null tenant_id values';
  end if;
end;
$$;

commit;
