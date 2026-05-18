begin;

create extension if not exists pgcrypto;

create table if not exists public.inventory_stock (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  catalog_item_id uuid not null references public.catalog_items(id) on delete cascade,
  quantity_on_hand numeric not null default 0,
  low_stock_threshold numeric not null default 0,
  updated_at timestamptz not null default now(),
  constraint inventory_stock_tenant_branch_catalog_item_key
    unique (tenant_id, branch_id, catalog_item_id),
  constraint inventory_stock_low_stock_threshold_nonnegative
    check (low_stock_threshold >= 0)
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid not null references public.branches(id) on delete cascade,
  catalog_item_id uuid not null references public.catalog_items(id) on delete restrict,
  movement_type text not null,
  quantity_delta numeric not null,
  source_type text null,
  source_id uuid null,
  notes text null,
  created_by uuid null,
  created_at timestamptz not null default now(),
  constraint inventory_movements_movement_type_check
    check (
      movement_type in (
        'purchase_receive',
        'manual_adjustment',
        'sale',
        'sale_void',
        'transfer_in',
        'transfer_out'
      )
    )
);

create index if not exists idx_inventory_stock_tenant_branch
  on public.inventory_stock (tenant_id, branch_id);

create index if not exists idx_inventory_stock_tenant_branch_catalog_item
  on public.inventory_stock (tenant_id, branch_id, catalog_item_id);

create index if not exists idx_inventory_movements_tenant_branch_catalog_item_created
  on public.inventory_movements (
    tenant_id,
    branch_id,
    catalog_item_id,
    created_at desc
  );

create index if not exists idx_inventory_movements_tenant_source
  on public.inventory_movements (tenant_id, source_type, source_id);

create index if not exists idx_inventory_movements_tenant_created
  on public.inventory_movements (tenant_id, created_at desc);

create or replace function public.set_inventory_stock_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_set_inventory_stock_updated_at on public.inventory_stock;
create trigger trg_set_inventory_stock_updated_at
before update on public.inventory_stock
for each row
execute function public.set_inventory_stock_updated_at();

create or replace function public.get_branch_inventory(
  p_tenant_id uuid,
  p_branch_id uuid
)
returns table (
  catalog_item_id uuid,
  item_name text,
  item_type text,
  category_id uuid,
  quantity_on_hand numeric,
  low_stock_threshold numeric,
  is_low_stock boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
begin
  if p_tenant_id is null then
    raise exception 'tenant_id is required'
      using errcode = '22023';
  end if;

  if p_branch_id is null then
    raise exception 'branch_id is required'
      using errcode = '22023';
  end if;

  select b.id
  into v_branch_id
  from public.branches as b
  where b.id = p_branch_id
    and b.tenant_id = p_tenant_id;

  if v_branch_id is null then
    raise exception 'branch does not belong to tenant'
      using errcode = '42501';
  end if;

  return query
  select
    ci.id as catalog_item_id,
    ci.name as item_name,
    ci.item_type,
    cc.id as category_id,
    coalesce(ins.quantity_on_hand, 0) as quantity_on_hand,
    coalesce(ins.low_stock_threshold, 0) as low_stock_threshold,
    coalesce(ins.quantity_on_hand, 0) <= coalesce(ins.low_stock_threshold, 0)
      as is_low_stock
  from public.catalog_items as ci
  left join public.inventory_stock as ins
    on ins.catalog_item_id = ci.id
   and ins.tenant_id = p_tenant_id
   and ins.branch_id = p_branch_id
  left join public.catalog_categories as cc
    on cc.name = ci.category
   and cc.tenant_id = p_tenant_id
  where ci.tenant_id = p_tenant_id
  order by ci.name asc, ci.id asc;
end;
$$;

create or replace function public.adjust_inventory_stock(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_catalog_item_id uuid,
  p_quantity_delta numeric,
  p_movement_type text,
  p_notes text default null
)
returns table (
  id uuid,
  tenant_id uuid,
  branch_id uuid,
  catalog_item_id uuid,
  quantity_on_hand numeric,
  low_stock_threshold numeric,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
  v_catalog_item_id uuid;
  v_movement_type text := nullif(trim(coalesce(p_movement_type, '')), '');
begin
  if p_tenant_id is null then
    raise exception 'tenant_id is required'
      using errcode = '22023';
  end if;

  if p_branch_id is null then
    raise exception 'branch_id is required'
      using errcode = '22023';
  end if;

  if p_catalog_item_id is null then
    raise exception 'catalog_item_id is required'
      using errcode = '22023';
  end if;

  if coalesce(p_quantity_delta, 0) = 0 then
    raise exception 'quantity_delta must not be zero'
      using errcode = '22023';
  end if;

  if v_movement_type not in ('purchase_receive', 'manual_adjustment') then
    raise exception 'movement_type is not allowed for manual stock adjustment'
      using errcode = '22023';
  end if;

  select b.id
  into v_branch_id
  from public.branches as b
  where b.id = p_branch_id
    and b.tenant_id = p_tenant_id;

  if v_branch_id is null then
    raise exception 'branch does not belong to tenant'
      using errcode = '42501';
  end if;

  select ci.id
  into v_catalog_item_id
  from public.catalog_items as ci
  where ci.id = p_catalog_item_id
    and ci.tenant_id = p_tenant_id;

  if v_catalog_item_id is null then
    raise exception 'catalog item does not belong to tenant'
      using errcode = '42501';
  end if;

  insert into public.inventory_movements (
    tenant_id,
    branch_id,
    catalog_item_id,
    movement_type,
    quantity_delta,
    source_type,
    source_id,
    notes,
    created_by
  )
  values (
    p_tenant_id,
    p_branch_id,
    p_catalog_item_id,
    v_movement_type,
    p_quantity_delta,
    'manual',
    null,
    nullif(trim(coalesce(p_notes, '')), ''),
    auth.uid()
  );

  return query
  insert into public.inventory_stock (
    tenant_id,
    branch_id,
    catalog_item_id,
    quantity_on_hand,
    low_stock_threshold
  )
  values (
    p_tenant_id,
    p_branch_id,
    p_catalog_item_id,
    p_quantity_delta,
    0
  )
  on conflict (tenant_id, branch_id, catalog_item_id)
  do update
  set quantity_on_hand =
        public.inventory_stock.quantity_on_hand + excluded.quantity_on_hand
  returning
    public.inventory_stock.id,
    public.inventory_stock.tenant_id,
    public.inventory_stock.branch_id,
    public.inventory_stock.catalog_item_id,
    public.inventory_stock.quantity_on_hand,
    public.inventory_stock.low_stock_threshold,
    public.inventory_stock.updated_at;
end;
$$;

grant execute on function public.get_branch_inventory(uuid, uuid)
  to authenticated, service_role;

grant execute on function public.adjust_inventory_stock(
  uuid,
  uuid,
  uuid,
  numeric,
  text,
  text
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
