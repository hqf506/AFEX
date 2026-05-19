begin;

create or replace view public.inventory_movements_view as
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
  source_invoice.id as resolved_invoice_id,
  source_order.created_by_employee_id as resolved_employee_id,
  coalesce(
    nullif(trim(order_p.full_name), ''),
    nullif(trim(to_jsonb(order_p)->>'name'), ''),
    nullif(trim(order_p.username), ''),
    nullif(trim(order_pp.full_name), ''),
    nullif(trim(order_pp.username), '')
  ) as resolved_employee_name,
  coalesce(
    case
      when im.movement_type in ('sale', 'sale_void')
        then coalesce(
          nullif(trim(order_p.full_name), ''),
          nullif(trim(to_jsonb(order_p)->>'name'), ''),
          nullif(trim(order_p.username), ''),
          nullif(trim(order_pp.full_name), ''),
          nullif(trim(order_pp.username), '')
        )
    end,
    nullif(trim(p.full_name), ''),
    nullif(trim(to_jsonb(p)->>'name'), ''),
    nullif(trim(p.username), ''),
    nullif(trim(pp.full_name), ''),
    nullif(trim(pp.username), ''),
    'النظام'
  ) as user_name,
  coalesce(
    case
      when im.movement_type in ('sale', 'sale_void')
        then coalesce(
          nullif(trim(order_p.full_name), ''),
          nullif(trim(to_jsonb(order_p)->>'name'), ''),
          nullif(trim(order_p.username), ''),
          nullif(trim(order_pp.full_name), ''),
          nullif(trim(order_pp.username), '')
        )
    end,
    nullif(trim(p.full_name), ''),
    nullif(trim(to_jsonb(p)->>'name'), ''),
    nullif(trim(p.username), ''),
    nullif(trim(pp.full_name), ''),
    nullif(trim(pp.username), ''),
    'النظام'
  ) as created_by_name,
  coalesce(
    case
      when im.movement_type in ('sale', 'sale_void')
        then coalesce(
          nullif(trim(order_p.full_name), ''),
          nullif(trim(to_jsonb(order_p)->>'name'), ''),
          nullif(trim(order_p.username), ''),
          nullif(trim(order_pp.full_name), ''),
          nullif(trim(order_pp.username), '')
        )
    end,
    nullif(trim(p.full_name), ''),
    nullif(trim(to_jsonb(p)->>'name'), ''),
    nullif(trim(p.username), ''),
    nullif(trim(pp.full_name), ''),
    nullif(trim(pp.username), '')
  ) as actor_name,
  case
    when im.movement_type in ('sale', 'sale_void')
      and order_p.id is not null
      and coalesce(to_jsonb(order_p)->>'role', '') = 'owner'
      then 'owner'
    when im.movement_type in ('sale', 'sale_void')
      and order_p.id is not null
      then 'admin'
    when im.movement_type in ('sale', 'sale_void')
      and order_pp.id is not null
      then 'pos_employee'
    when p.id is not null and coalesce(to_jsonb(p)->>'role', '') = 'owner'
      then 'owner'
    when p.id is not null
      then 'admin'
    when pp.id is not null
      then 'pos_employee'
    when im.created_by is null
      then 'unknown'
    else 'system'
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
  and pp.tenant_id = im.tenant_id
left join public.invoice_items as source_invoice_item
  on source_invoice_item.id = im.source_id
  and source_invoice_item.tenant_id = im.tenant_id
  and im.movement_type in ('sale', 'sale_void')
left join public.invoices as source_invoice
  on source_invoice.tenant_id = im.tenant_id
  and source_invoice.branch_id = im.branch_id
  and source_invoice.id = coalesce(source_invoice_item.invoice_id, im.source_id)
  and im.movement_type in ('sale', 'sale_void')
left join public.orders as source_order
  on source_order.id = source_invoice.order_id
  and source_order.tenant_id = im.tenant_id
  and source_order.branch_id = im.branch_id
left join public.profiles as order_p
  on order_p.id = source_order.created_by_employee_id
  and order_p.tenant_id = im.tenant_id
left join public.pos_profiles as order_pp
  on order_pp.id = source_order.created_by_employee_id
  and order_pp.tenant_id = im.tenant_id;

grant select on public.inventory_movements_view to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
