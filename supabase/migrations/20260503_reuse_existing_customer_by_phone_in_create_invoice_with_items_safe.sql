begin;

create or replace function public.create_invoice_with_items_safe(
  p_customer_name text,
  p_customer_phone text,
  p_customer_notes text default '',
  p_payment_method text default 'cash',
  p_discount numeric default 0,
  p_tax numeric default 0,
  p_note text default '',
  p_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
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
begin
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
  ),
  validated_items as (
    select
      line_no,
      item_id,
      item_name_snapshot,
      item_type_snapshot,
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
    raise exception 'لا توجد عناصر صالحة لإنشاء الفاتورة'
      using errcode = 'P0001';
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
    limit 1;
  end if;

  if v_customer_id is null then
    insert into public.customers (
      name,
      phone
    )
    values (
      nullif(v_customer_name, ''),
      nullif(v_customer_phone, '')
    )
    returning id into v_customer_id;
  elsif v_customer_name <> '' and coalesce(trim(v_existing_customer_name), '') = '' then
    update public.customers
    set name = v_customer_name
    where id = v_customer_id;
  end if;

  insert into public.orders (
    customer_id,
    status
  )
  values (
    v_customer_id,
    v_status
  )
  returning id into v_order_id;

  insert into public.invoices (
    order_id,
    customer_id,
    payment_method,
    payment_status,
    note,
    subtotal,
    discount,
    tax,
    total
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
    v_total
  )
  returning id, invoice_number into v_invoice_id, v_invoice_number;

  insert into public.invoice_items (
    invoice_id,
    item_id,
    item_name_snapshot,
    item_type_snapshot,
    item_name,
    item_type,
    quantity,
    unit_price,
    line_total,
    cost_price
  )
  select
    v_invoice_id,
    nullif(item ->> 'item_id', '')::uuid,
    item ->> 'item_name_snapshot',
    item ->> 'item_type_snapshot',
    item ->> 'item_name_snapshot',
    item ->> 'item_type_snapshot',
    (item ->> 'quantity')::numeric,
    (item ->> 'unit_price')::numeric,
    (item ->> 'line_total')::numeric,
    coalesce((item ->> 'cost_price')::numeric, 0)
  from jsonb_array_elements(v_valid_items) as item;

  select order_number
  into v_order_number
  from public.orders
  where id = v_order_id;

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
    'itemsCount', v_valid_items_count
  );
end;
$$;

commit;
