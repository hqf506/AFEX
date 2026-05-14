begin;

alter table public.invoice_items
  add column if not exists item_name text,
  add column if not exists item_type text,
  add column if not exists quantity numeric,
  add column if not exists unit_price numeric,
  add column if not exists cost_price numeric not null default 0;

update public.invoice_items
set
  item_name = coalesce(nullif(item_name, ''), item_name_snapshot),
  item_type = coalesce(nullif(item_type, ''), item_type_snapshot)
where
  item_name is null
  or item_name = ''
  or item_type is null
  or item_type = '';

alter table public.invoice_items
  alter column item_id drop not null;

alter table public.invoice_items
  drop constraint if exists invoice_items_item_id_fkey;

alter table public.invoice_items
  add constraint invoice_items_item_id_fkey
  foreign key (item_id)
  references public.catalog_items(id)
  on delete set null;

drop function if exists public.create_invoice_with_items_safe(
  text,
  text,
  text,
  text,
  numeric,
  numeric,
  text,
  jsonb
);

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
  v_order_id uuid;
  v_invoice_id uuid;
  v_order_number text;
  v_invoice_number text;
  v_status text := 'new';
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

  insert into public.customers (
    name,
    phone
  )
  values (
    nullif(v_customer_name, ''),
    nullif(v_customer_phone, '')
  )
  returning id into v_customer_id;

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
  returning id into v_invoice_id;

  insert into public.invoice_items (
    invoice_id,
    item_id,
    item_name,
    item_type,
    item_name_snapshot,
    item_type_snapshot,
    quantity,
    unit_price,
    line_total,
    cost_price
  )
  select
    v_invoice_id,
    (entry ->> 'item_id')::uuid,
    entry ->> 'item_name_snapshot',
    entry ->> 'item_type_snapshot',
    entry ->> 'item_name_snapshot',
    entry ->> 'item_type_snapshot',
    (entry ->> 'quantity')::numeric,
    (entry ->> 'unit_price')::numeric,
    (entry ->> 'line_total')::numeric,
    (entry ->> 'cost_price')::numeric
  from jsonb_array_elements(v_valid_items) as entry;

  select
    coalesce(o.order_number, o.id::text),
    coalesce(o.status, v_status)
  into v_order_number, v_status
  from public.orders o
  where o.id = v_order_id;

  select
    coalesce(i.invoice_number, i.id::text)
  into v_invoice_number
  from public.invoices i
  where i.id = v_invoice_id;

  return jsonb_build_object(
    'customer_id', v_customer_id,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'invoice_id', v_invoice_id,
    'invoice_number', v_invoice_number,
    'status', v_status
  );
end;
$$;

drop function if exists public.create_invoice_with_items(
  text,
  text,
  text,
  text,
  numeric,
  numeric,
  text,
  jsonb
);

create or replace function public.create_invoice_with_items(
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
language sql
security definer
set search_path = public
as $$
  select public.create_invoice_with_items_safe(
    p_customer_name,
    p_customer_phone,
    p_customer_notes,
    p_payment_method,
    p_discount,
    p_tax,
    p_note,
    coalesce(p_items, '[]'::jsonb)
  );
$$;

drop function if exists public.create_invoice_with_items(
  text,
  text,
  text,
  text,
  numeric,
  numeric,
  text,
  json
);

create or replace function public.create_invoice_with_items(
  p_customer_name text,
  p_customer_phone text,
  p_customer_notes text default '',
  p_payment_method text default 'cash',
  p_discount numeric default 0,
  p_tax numeric default 0,
  p_note text default '',
  p_items json default '[]'::json
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.create_invoice_with_items_safe(
    p_customer_name,
    p_customer_phone,
    p_customer_notes,
    p_payment_method,
    p_discount,
    p_tax,
    p_note,
    coalesce(p_items::jsonb, '[]'::jsonb)
  );
$$;

grant execute on function public.create_invoice_with_items(
  text,
  text,
  text,
  text,
  numeric,
  numeric,
  text,
  jsonb
) to authenticated, service_role;

grant execute on function public.create_invoice_with_items(
  text,
  text,
  text,
  text,
  numeric,
  numeric,
  text,
  json
) to authenticated, service_role;

grant execute on function public.create_invoice_with_items_safe(
  text,
  text,
  text,
  text,
  numeric,
  numeric,
  text,
  jsonb
) to authenticated, service_role;

commit;
