begin;

drop function if exists public.restore_inventory_for_cancelled_invoice(uuid, uuid);

create index if not exists idx_inventory_movements_sale_void_source_item
  on public.inventory_movements (tenant_id, source_id, catalog_item_id)
  where movement_type = 'sale_void';

create or replace function public.restore_inventory_for_cancelled_invoice(
  p_invoice_id uuid,
  p_tenant_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice_id uuid;
  v_invoice_branch_id uuid;
  v_invoice_items_count integer := 0;
  v_restorable_items_count integer := 0;
  v_restored_items_count integer := 0;
  v_restored_quantity numeric := 0;
begin
  if p_invoice_id is null then
    raise exception 'invoice_id is required'
      using errcode = '22023';
  end if;

  if p_tenant_id is null then
    raise exception 'tenant_id is required'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_tenant_id::text), hashtext(p_invoice_id::text));

  select inv.id, inv.branch_id
  into v_invoice_id, v_invoice_branch_id
  from public.invoices as inv
  join public.branches as b
    on b.id = inv.branch_id
   and b.tenant_id = inv.tenant_id
  where inv.id = p_invoice_id
    and inv.tenant_id = p_tenant_id
  for update of inv;

  if v_invoice_id is null then
    raise exception 'invoice not found for tenant or branch'
      using errcode = 'P0002';
  end if;

  if v_invoice_branch_id is null then
    raise exception 'invoice branch_id is required'
      using errcode = '22023';
  end if;

  select count(*)
  into v_invoice_items_count
  from public.invoice_items as ii
  where ii.invoice_id = p_invoice_id
    and ii.tenant_id = p_tenant_id;

  with resolved_invoice_items as (
    select
      coalesce(ci_direct.id, ci_from_branch.id) as catalog_item_id,
      greatest(coalesce(ii.quantity, 0), 0) as quantity
    from public.invoice_items as ii
    left join public.catalog_items as ci_direct
      on ci_direct.id = ii.item_id
     and ci_direct.tenant_id = p_tenant_id
    left join public.branch_catalog_items as bci
      on bci.id = ii.item_id
     and bci.tenant_id = p_tenant_id
     and bci.branch_id = v_invoice_branch_id
    left join public.catalog_items as ci_from_branch
      on ci_from_branch.id = bci.catalog_item_id
     and ci_from_branch.tenant_id = p_tenant_id
    where ii.invoice_id = p_invoice_id
      and ii.tenant_id = p_tenant_id
      and ii.item_id is not null
  ),
  tracked_items as (
    select
      resolved_invoice_items.catalog_item_id,
      sum(resolved_invoice_items.quantity) as restore_quantity
    from resolved_invoice_items
    join public.catalog_items as ci
      on ci.id = resolved_invoice_items.catalog_item_id
     and ci.tenant_id = p_tenant_id
     and ci.track_inventory = true
     and (ci.item_type = 'product' or ci.is_composite = true)
    group by resolved_invoice_items.catalog_item_id
    having sum(resolved_invoice_items.quantity) > 0
  ),
  restorable_items as (
    select tracked_items.catalog_item_id, tracked_items.restore_quantity
    from tracked_items
    where not exists (
      select 1
      from public.inventory_movements as im
      where im.tenant_id = p_tenant_id
        and im.source_id = p_invoice_id
        and im.catalog_item_id = tracked_items.catalog_item_id
        and im.movement_type = 'sale_void'
    )
  ),
  restorable_summary as (
    select count(*) as item_count
    from restorable_items
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
      restorable_items.catalog_item_id,
      restorable_items.restore_quantity,
      0
    from restorable_items
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
      restorable_items.catalog_item_id,
      'sale_void',
      restorable_items.restore_quantity,
      'invoice_cancel',
      p_invoice_id,
      'Inventory restored after cancelled invoice',
      auth.uid()
    from restorable_items
    join upserted_stock
      on upserted_stock.catalog_item_id = restorable_items.catalog_item_id
    returning quantity_delta
  )
  select
    (select item_count from restorable_summary),
    count(*),
    coalesce(sum(quantity_delta), 0)
  into v_restorable_items_count, v_restored_items_count, v_restored_quantity
  from inserted_movements;

  return jsonb_build_object(
    'success', true,
    'invoiceId', p_invoice_id,
    'tenantId', p_tenant_id,
    'branchId', v_invoice_branch_id,
    'invoiceItemsCount', v_invoice_items_count,
    'restorableItemsCount', v_restorable_items_count,
    'restoredItemsCount', v_restored_items_count,
    'restoredQuantity', v_restored_quantity
  );
end;
$$;

grant execute on function public.restore_inventory_for_cancelled_invoice(uuid, uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
