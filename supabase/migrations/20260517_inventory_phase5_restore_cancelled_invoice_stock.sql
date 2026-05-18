begin;

create unique index if not exists idx_inventory_movements_invoice_sale_void_once
  on public.inventory_movements (
    tenant_id,
    source_type,
    source_id,
    catalog_item_id,
    movement_type
  )
  where source_type = 'invoice'
    and movement_type = 'sale_void';

create or replace function public.restore_inventory_for_cancelled_invoice(
  p_tenant_id uuid,
  p_invoice_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice_branch_id uuid;
  v_existing_restore_count integer := 0;
  v_restored_items_count integer := 0;
  v_restored_quantity numeric := 0;
begin
  if p_tenant_id is null then
    raise exception 'tenant_id is required'
      using errcode = '22023';
  end if;

  if p_invoice_id is null then
    raise exception 'invoice_id is required'
      using errcode = '22023';
  end if;

  select inv.branch_id
  into v_invoice_branch_id
  from public.invoices as inv
  where inv.id = p_invoice_id
    and inv.tenant_id = p_tenant_id
  for update;

  if v_invoice_branch_id is null then
    raise exception 'invoice not found for tenant'
      using errcode = 'P0002';
  end if;

  select count(*)
  into v_existing_restore_count
  from public.inventory_movements as im
  where im.tenant_id = p_tenant_id
    and im.source_type = 'invoice'
    and im.source_id = p_invoice_id
    and im.movement_type = 'sale_void';

  if v_existing_restore_count > 0 then
    return jsonb_build_object(
      'success', true,
      'alreadyRestored', true,
      'invoiceId', p_invoice_id,
      'branchId', v_invoice_branch_id,
      'restoredItemsCount', 0,
      'restoredQuantity', 0
    );
  end if;

  perform 1
  from public.inventory_stock as stock
  join (
    select
      ii.item_id as catalog_item_id,
      sum(greatest(coalesce(ii.quantity, 0), 0)) as restore_quantity
    from public.invoice_items as ii
    join public.catalog_items as ci
      on ci.id = ii.item_id
     and ci.tenant_id = p_tenant_id
     and ci.item_type = 'product'
    where ii.invoice_id = p_invoice_id
      and ii.tenant_id = p_tenant_id
      and ii.item_id is not null
    group by ii.item_id
  ) as product_items
    on product_items.catalog_item_id = stock.catalog_item_id
  where stock.tenant_id = p_tenant_id
    and stock.branch_id = v_invoice_branch_id
  for update of stock;

  with product_items as (
    select
      ii.item_id as catalog_item_id,
      sum(greatest(coalesce(ii.quantity, 0), 0)) as restore_quantity
    from public.invoice_items as ii
    join public.catalog_items as ci
      on ci.id = ii.item_id
     and ci.tenant_id = p_tenant_id
     and ci.item_type = 'product'
    where ii.invoice_id = p_invoice_id
      and ii.tenant_id = p_tenant_id
      and ii.item_id is not null
    group by ii.item_id
    having sum(greatest(coalesce(ii.quantity, 0), 0)) > 0
  ),
  upserted_stock as (
    insert into public.inventory_stock (
      tenant_id,
      branch_id,
      catalog_item_id,
      quantity_on_hand,
      low_stock_threshold
    )
    select
      p_tenant_id,
      v_invoice_branch_id,
      product_items.catalog_item_id,
      product_items.restore_quantity,
      0
    from product_items
    on conflict (tenant_id, branch_id, catalog_item_id)
    do update
    set quantity_on_hand =
      public.inventory_stock.quantity_on_hand + excluded.quantity_on_hand
    returning catalog_item_id
  ),
  inserted_movements as (
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
    select
      p_tenant_id,
      v_invoice_branch_id,
      product_items.catalog_item_id,
      'sale_void',
      product_items.restore_quantity,
      'invoice',
      p_invoice_id,
      'Restore stock from cancelled invoice',
      auth.uid()
    from product_items
    returning quantity_delta
  )
  select
    count(*),
    coalesce(sum(quantity_delta), 0)
  into v_restored_items_count, v_restored_quantity
  from inserted_movements;

  return jsonb_build_object(
    'success', true,
    'alreadyRestored', false,
    'invoiceId', p_invoice_id,
    'branchId', v_invoice_branch_id,
    'restoredItemsCount', v_restored_items_count,
    'restoredQuantity', v_restored_quantity
  );
end;
$$;

grant execute on function public.restore_inventory_for_cancelled_invoice(uuid, uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
