begin;

alter table public.catalog_items
add column if not exists track_inventory boolean not null default false;

alter table public.catalog_items
add column if not exists inventory_enabled_at timestamptz null;

alter table public.catalog_items
add column if not exists is_composite boolean not null default false;

create index if not exists idx_catalog_items_tenant_track_inventory
  on public.catalog_items (tenant_id, track_inventory)
  where track_inventory = true;

create or replace function public.ensure_inventory_stock_for_catalog_item(
  p_tenant_id uuid,
  p_catalog_item_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_catalog_item_id uuid;
  v_inserted_count integer := 0;
begin
  if p_tenant_id is null then
    raise exception 'tenant_id is required'
      using errcode = '22023';
  end if;

  if p_catalog_item_id is null then
    raise exception 'catalog_item_id is required'
      using errcode = '22023';
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

  insert into public.inventory_stock (
    tenant_id,
    branch_id,
    catalog_item_id,
    quantity_on_hand,
    low_stock_threshold
  )
  select
    p_tenant_id,
    b.id,
    p_catalog_item_id,
    0,
    0
  from public.branches as b
  where b.tenant_id = p_tenant_id
  on conflict (tenant_id, branch_id, catalog_item_id)
  do nothing;

  get diagnostics v_inserted_count = row_count;

  return v_inserted_count;
end;
$$;

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
    and ci.track_inventory = true
  order by ci.name asc, ci.id asc;
end;
$$;

create or replace function public.create_invoice_with_items_safe(
  p_customer_name text,
  p_customer_phone text,
  p_customer_notes text default '',
  p_payment_method text default 'cash',
  p_discount numeric default 0,
  p_tax numeric default 0,
  p_note text default '',
  p_items jsonb default '[]'::jsonb,
  p_client_idempotency_key text default '',
  p_created_by_employee_id uuid default null,
  p_tenant_id uuid default null,
  p_branch_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_auth_tenant_id uuid;
  v_customer_id uuid;
  v_existing_customer_name text;
  v_order_id uuid;
  v_invoice_id uuid;
  v_order_number text;
  v_invoice_number text;
  v_status text := 'in_progress';
  v_subtotal numeric := 0;
  v_discount numeric := greatest(coalesce(p_discount, 0), 0);
  v_tax_total numeric := greatest(coalesce(p_tax, 0), 0);
  v_taxable_base numeric := 0;
  v_total numeric := 0;
  v_payment_status text := case
    when coalesce(nullif(trim(p_payment_method), ''), 'cash') = 'transfer'
      then 'pending'
    else 'paid'
  end;
  v_valid_items jsonb := '[]'::jsonb;
  v_valid_items_count integer := 0;
  v_customer_name text := trim(coalesce(p_customer_name, ''));
  v_customer_phone text := trim(coalesce(p_customer_phone, ''));
  v_note text := trim(coalesce(p_note, ''));
  v_client_idempotency_key text := nullif(trim(coalesce(p_client_idempotency_key, '')), '');
  v_tenant_id uuid;
  v_resolved_branch_id uuid := p_branch_id;
  v_branch_tenant_id uuid;
  v_employee_tenant_id uuid;
  v_order_tenant_id uuid;
  v_invoice_tenant_id uuid;
  v_insufficient_item_name text;
begin
  if v_auth_user_id is not null then
    select tenant_id
    into v_auth_tenant_id
    from public.profiles
    where id = v_auth_user_id
    limit 1;

    if v_auth_tenant_id is null then
      raise exception 'Authenticated user has no tenant'
        using errcode = '42501';
    end if;

    if p_tenant_id is not null and p_tenant_id is distinct from v_auth_tenant_id then
      raise exception 'Requested tenant does not match authenticated tenant'
        using errcode = '42501';
    end if;

    v_tenant_id := v_auth_tenant_id;
  else
    v_tenant_id := p_tenant_id;
  end if;

  if v_tenant_id is null then
    raise exception 'Tenant context is required'
      using errcode = '42501';
  end if;

  if v_resolved_branch_id is null and v_auth_user_id is not null then
    select branch_id
    into v_resolved_branch_id
    from public.profiles
    where id = v_auth_user_id
    limit 1;
  end if;

  if v_resolved_branch_id is null then
    raise exception 'Branch context is required'
      using errcode = '42501';
  end if;

  select tenant_id
  into v_branch_tenant_id
  from public.branches
  where id = v_resolved_branch_id
  limit 1;

  if v_branch_tenant_id is null then
    raise exception 'Branch not found'
      using errcode = '23503';
  end if;

  if v_branch_tenant_id is distinct from v_tenant_id then
    raise exception 'Branch does not belong to tenant'
      using errcode = '42501';
  end if;

  if p_created_by_employee_id is not null then
    select tenant_id
    into v_employee_tenant_id
    from public.profiles
    where id = p_created_by_employee_id
    limit 1;

    if v_employee_tenant_id is null then
      raise exception 'Employee profile not found'
        using errcode = '23503';
    end if;

    if v_employee_tenant_id is distinct from v_tenant_id then
      raise exception 'Employee profile does not belong to tenant'
        using errcode = '42501';
    end if;
  end if;

  with normalized_items as (
    select
      parsed.line_no,
      ci.id as item_id,
      coalesce(nullif(trim(parsed.item_name), ''), ci.name) as item_name_snapshot,
      case
        when lower(coalesce(nullif(trim(parsed.item_type), ''), ci.item_type)) = 'service'
          then 'service'
        else 'product'
      end as item_type_snapshot,
      ci.is_composite,
      ci.track_inventory,
      greatest(coalesce(parsed.quantity, 0), 0) as quantity,
      greatest(coalesce(parsed.unit_price, ci.default_price, 0), 0) as unit_price,
      greatest(coalesce(ci.cost_price, 0), 0) as cost_price
    from (
      select
        source.ordinality as line_no,
        case
          when trim(coalesce(source.item ->> 'item_id', '')) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            then trim(source.item ->> 'item_id')::uuid
          else null
        end as item_id,
        source.item ->> 'item_name' as item_name,
        source.item ->> 'item_type' as item_type,
        case
          when coalesce(source.item ->> 'quantity', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
            then (source.item ->> 'quantity')::numeric
          else null
        end as quantity,
        case
          when coalesce(source.item ->> 'unit_price', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
            then (source.item ->> 'unit_price')::numeric
          else null
        end as unit_price
      from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) with ordinality as source(item, ordinality)
    ) as parsed
    join public.catalog_items ci
      on ci.id = parsed.item_id
     and ci.tenant_id = v_tenant_id
  ),
  validated_items as (
    select
      line_no,
      item_id,
      item_name_snapshot,
      item_type_snapshot,
      is_composite,
      track_inventory,
      quantity,
      unit_price,
      cost_price,
      quantity * unit_price as line_total
    from normalized_items
    where quantity > 0
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'item_id', item_id,
          'item_name_snapshot', item_name_snapshot,
          'item_type_snapshot', item_type_snapshot,
          'is_composite', is_composite,
          'track_inventory', track_inventory,
          'quantity', quantity,
          'unit_price', unit_price,
          'line_total', line_total,
          'cost_price', cost_price
        )
        order by line_no
      ),
      '[]'::jsonb
    ),
    count(*),
    coalesce(sum(line_total), 0)
  into v_valid_items, v_valid_items_count, v_subtotal
  from validated_items;

  if v_valid_items_count = 0 then
    raise exception 'No valid items were provided for invoice creation'
      using errcode = 'P0001';
  end if;

  with tracked_product_items as (
    select
      item.item_id,
      min(item.item_name_snapshot) as item_name_snapshot,
      sum(item.quantity) as requested_quantity
    from jsonb_to_recordset(v_valid_items) as item(
      item_id uuid,
      item_name_snapshot text,
      item_type_snapshot text,
      is_composite boolean,
      track_inventory boolean,
      quantity numeric
    )
    where (item.item_type_snapshot = 'product' or item.is_composite = true)
      and item.track_inventory = true
    group by item.item_id
  )
  select tpi.item_name_snapshot
  into v_insufficient_item_name
  from tracked_product_items as tpi
  left join public.inventory_stock as stock
    on stock.catalog_item_id = tpi.item_id
   and stock.tenant_id = v_tenant_id
   and stock.branch_id = v_resolved_branch_id
  where stock.id is null
     or stock.quantity_on_hand < tpi.requested_quantity
  order by tpi.item_name_snapshot asc
  limit 1;

  if v_insufficient_item_name is not null then
    raise exception 'INSUFFICIENT_STOCK'
      using
        errcode = 'P0001',
        detail = v_insufficient_item_name,
        hint = 'INSUFFICIENT_STOCK';
  end if;

  perform 1
  from public.inventory_stock as stock
  join (
    select
      item.item_id,
      sum(item.quantity) as requested_quantity
    from jsonb_to_recordset(v_valid_items) as item(
      item_id uuid,
      item_type_snapshot text,
      is_composite boolean,
      track_inventory boolean,
      quantity numeric
    )
    where (item.item_type_snapshot = 'product' or item.is_composite = true)
      and item.track_inventory = true
    group by item.item_id
  ) as tracked_product_items
    on tracked_product_items.item_id = stock.catalog_item_id
  where stock.tenant_id = v_tenant_id
    and stock.branch_id = v_resolved_branch_id
  for update of stock;

  v_insufficient_item_name := null;

  with tracked_product_items as (
    select
      item.item_id,
      min(item.item_name_snapshot) as item_name_snapshot,
      sum(item.quantity) as requested_quantity
    from jsonb_to_recordset(v_valid_items) as item(
      item_id uuid,
      item_name_snapshot text,
      item_type_snapshot text,
      is_composite boolean,
      track_inventory boolean,
      quantity numeric
    )
    where (item.item_type_snapshot = 'product' or item.is_composite = true)
      and item.track_inventory = true
    group by item.item_id
  )
  select tpi.item_name_snapshot
  into v_insufficient_item_name
  from tracked_product_items as tpi
  left join public.inventory_stock as stock
    on stock.catalog_item_id = tpi.item_id
   and stock.tenant_id = v_tenant_id
   and stock.branch_id = v_resolved_branch_id
  where stock.id is null
     or stock.quantity_on_hand < tpi.requested_quantity
  order by tpi.item_name_snapshot asc
  limit 1;

  if v_insufficient_item_name is not null then
    raise exception 'INSUFFICIENT_STOCK'
      using
        errcode = 'P0001',
        detail = v_insufficient_item_name,
        hint = 'INSUFFICIENT_STOCK';
  end if;

  v_taxable_base := greatest(v_subtotal - v_discount, 0);
  v_total := v_taxable_base + v_tax_total;

  if v_customer_phone <> '' then
    select
      id,
      name
    into
      v_customer_id,
      v_existing_customer_name
    from public.customers
    where phone = v_customer_phone
      and tenant_id = v_tenant_id
    limit 1;
  end if;

  if v_customer_id is null then
    insert into public.customers (
      name,
      phone,
      branch_id,
      tenant_id
    )
    values (
      nullif(v_customer_name, ''),
      nullif(v_customer_phone, ''),
      v_resolved_branch_id,
      v_tenant_id
    )
    returning id into v_customer_id;
  elsif v_customer_name <> '' and coalesce(trim(v_existing_customer_name), '') = '' then
    update public.customers
    set name = v_customer_name
    where id = v_customer_id
      and tenant_id = v_tenant_id;
  end if;

  insert into public.orders (
    customer_id,
    status,
    client_idempotency_key,
    created_by_employee_id,
    branch_id,
    tenant_id
  )
  values (
    v_customer_id,
    v_status,
    v_client_idempotency_key,
    p_created_by_employee_id,
    v_resolved_branch_id,
    v_tenant_id
  )
  returning id, tenant_id into v_order_id, v_order_tenant_id;

  insert into public.invoices (
    order_id,
    customer_id,
    payment_method,
    payment_status,
    note,
    subtotal,
    discount,
    tax,
    total,
    branch_id,
    tenant_id
  )
  values (
    v_order_id,
    v_customer_id,
    coalesce(nullif(trim(p_payment_method), ''), 'cash'),
    v_payment_status,
    nullif(v_note, ''),
    v_subtotal,
    v_discount,
    v_tax_total,
    v_total,
    v_resolved_branch_id,
    v_order_tenant_id
  )
  returning id, invoice_number, tenant_id into v_invoice_id, v_invoice_number, v_invoice_tenant_id;

  insert into public.invoice_items (
    invoice_id,
    item_id,
    item_name_snapshot,
    item_type_snapshot,
    quantity,
    unit_price,
    line_total,
    cost_price,
    tenant_id
  )
  select
    v_invoice_id,
    nullif(item ->> 'item_id', '')::uuid,
    item ->> 'item_name_snapshot',
    item ->> 'item_type_snapshot',
    (item ->> 'quantity')::numeric,
    (item ->> 'unit_price')::numeric,
    (item ->> 'line_total')::numeric,
    coalesce((item ->> 'cost_price')::numeric, 0),
    v_invoice_tenant_id
  from jsonb_array_elements(v_valid_items) as item;

  with tracked_product_items as (
    select
      item.item_id,
      sum(item.quantity) as requested_quantity
    from jsonb_to_recordset(v_valid_items) as item(
      item_id uuid,
      item_type_snapshot text,
      is_composite boolean,
      track_inventory boolean,
      quantity numeric
    )
    where (item.item_type_snapshot = 'product' or item.is_composite = true)
      and item.track_inventory = true
    group by item.item_id
  )
  update public.inventory_stock as stock
  set quantity_on_hand = stock.quantity_on_hand - tracked_product_items.requested_quantity
  from tracked_product_items
  where stock.tenant_id = v_tenant_id
    and stock.branch_id = v_resolved_branch_id
    and stock.catalog_item_id = tracked_product_items.item_id;

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
    v_tenant_id,
    v_resolved_branch_id,
    tracked_product_items.item_id,
    'sale',
    -tracked_product_items.requested_quantity,
    'invoice',
    v_invoice_id,
    'خصم تلقائي من بيع POS',
    v_auth_user_id
  from (
    select
      item.item_id,
      sum(item.quantity) as requested_quantity
    from jsonb_to_recordset(v_valid_items) as item(
      item_id uuid,
      item_type_snapshot text,
      is_composite boolean,
      track_inventory boolean,
      quantity numeric
    )
    where (item.item_type_snapshot = 'product' or item.is_composite = true)
      and item.track_inventory = true
    group by item.item_id
  ) as tracked_product_items;

  select order_number
  into v_order_number
  from public.orders
  where id = v_order_id
    and tenant_id = v_tenant_id;

  return jsonb_build_object(
    'orderId', v_order_id,
    'orderNumber', v_order_number,
    'invoiceId', v_invoice_id,
    'invoiceNumber', v_invoice_number,
    'customerId', v_customer_id,
    'status', v_status,
    'subtotal', v_subtotal,
    'discount', v_discount,
    'tax', v_tax_total,
    'total', v_total,
    'itemsCount', v_valid_items_count,
    'clientIdempotencyKey', v_client_idempotency_key,
    'createdByEmployeeId', p_created_by_employee_id,
    'tenantId', v_order_tenant_id,
    'branchId', v_resolved_branch_id
  );
end;
$$;

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
     and (ci.item_type = 'product' or ci.is_composite = true)
     and ci.track_inventory = true
    where ii.invoice_id = p_invoice_id
      and ii.tenant_id = p_tenant_id
      and ii.item_id is not null
    group by ii.item_id
  ) as tracked_product_items
    on tracked_product_items.catalog_item_id = stock.catalog_item_id
  where stock.tenant_id = p_tenant_id
    and stock.branch_id = v_invoice_branch_id
  for update of stock;

  with tracked_product_items as (
    select
      ii.item_id as catalog_item_id,
      sum(greatest(coalesce(ii.quantity, 0), 0)) as restore_quantity
    from public.invoice_items as ii
    join public.catalog_items as ci
      on ci.id = ii.item_id
     and ci.tenant_id = p_tenant_id
     and (ci.item_type = 'product' or ci.is_composite = true)
     and ci.track_inventory = true
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
      tracked_product_items.catalog_item_id,
      tracked_product_items.restore_quantity,
      0
    from tracked_product_items
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
      tracked_product_items.catalog_item_id,
      'sale_void',
      tracked_product_items.restore_quantity,
      'invoice',
      p_invoice_id,
      'Restore stock from cancelled invoice',
      auth.uid()
    from tracked_product_items
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

grant execute on function public.ensure_inventory_stock_for_catalog_item(uuid, uuid)
  to authenticated, service_role;

grant execute on function public.get_branch_inventory(uuid, uuid)
  to authenticated, service_role;

grant execute on function public.create_invoice_with_items_safe(
  text,
  text,
  text,
  text,
  numeric,
  numeric,
  text,
  jsonb,
  text,
  uuid,
  uuid,
  uuid
) to authenticated, service_role;

grant execute on function public.restore_inventory_for_cancelled_invoice(uuid, uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;

