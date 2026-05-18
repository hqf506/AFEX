begin;

create or replace function public.update_inventory_low_stock_threshold(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_catalog_item_id uuid,
  p_low_stock_threshold numeric
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

  if coalesce(p_low_stock_threshold, -1) < 0 then
    raise exception 'low_stock_threshold must not be negative'
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
    0,
    p_low_stock_threshold
  )
  on conflict (tenant_id, branch_id, catalog_item_id)
  do update
  set low_stock_threshold = excluded.low_stock_threshold
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

grant execute on function public.update_inventory_low_stock_threshold(
  uuid,
  uuid,
  uuid,
  numeric
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
