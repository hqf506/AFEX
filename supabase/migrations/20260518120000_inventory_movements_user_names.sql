begin;

drop function if exists public.adjust_inventory_stock(
  uuid,
  uuid,
  uuid,
  numeric,
  text,
  text
);

drop function if exists public.adjust_inventory_stock(
  uuid,
  uuid,
  uuid,
  numeric,
  text,
  text,
  uuid
);

create or replace function public.adjust_inventory_stock(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_catalog_item_id uuid,
  p_quantity_delta numeric,
  p_movement_type text,
  p_notes text default null,
  p_created_by uuid default null
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
  v_created_by uuid := coalesce(p_created_by, auth.uid());
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
    and ci.tenant_id = p_tenant_id
    and ci.track_inventory = true;

  if v_catalog_item_id is null then
    raise exception 'catalog item does not belong to tenant or is not tracked'
      using errcode = '42501';
  end if;

  if v_created_by is not null
    and not exists (
      select 1
      from public.profiles as p
      where p.id = v_created_by
        and p.tenant_id = p_tenant_id
    )
    and not exists (
      select 1
      from public.pos_profiles as pp
      where pp.id = v_created_by
        and pp.tenant_id = p_tenant_id
    ) then
    raise exception 'created_by does not belong to tenant'
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
    v_created_by
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

drop view if exists public.inventory_movements_view;

create view public.inventory_movements_view as
select
  im.id,
  im.tenant_id,
  im.branch_id,
  im.catalog_item_id,
  im.movement_type,
  im.quantity_delta,
  im.source_type,
  im.source_id,
  im.notes,
  im.created_by,
  im.created_at,
  ci.name as item_name,
  b.name as branch_name,
  coalesce(
    nullif(trim(pp.full_name), ''),
    nullif(trim(pp.username), ''),
    nullif(trim(p.full_name), ''),
    nullif(trim(p.username), ''),
    case when im.movement_type = 'sale' then 'POS' end,
    '-'
  ) as user_name,
  coalesce(
    nullif(trim(pp.full_name), ''),
    nullif(trim(pp.username), ''),
    nullif(trim(p.full_name), ''),
    nullif(trim(p.username), ''),
    case when im.movement_type = 'sale' then 'POS' end,
    '-'
  ) as created_by_name,
  case
    when pp.id is not null then 'pos_employee'
    when p.id is not null then 'admin'
    when im.movement_type = 'sale' then 'pos'
    else 'unknown'
  end as actor_type
from public.inventory_movements as im
left join public.catalog_items as ci
  on ci.id = im.catalog_item_id
  and ci.tenant_id = im.tenant_id
left join public.branches as b
  on b.id = im.branch_id
  and b.tenant_id = im.tenant_id
left join public.profiles as p
  on p.id = im.created_by
  and p.tenant_id = im.tenant_id
left join public.pos_profiles as pp
  on pp.id = im.created_by
  and pp.tenant_id = im.tenant_id;

grant execute on function public.adjust_inventory_stock(
  uuid,
  uuid,
  uuid,
  numeric,
  text,
  text,
  uuid
) to authenticated, service_role;

grant select on public.inventory_movements_view to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
