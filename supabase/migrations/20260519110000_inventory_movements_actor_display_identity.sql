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
  coalesce(
    nullif(trim(p.full_name), ''),
    nullif(trim(to_jsonb(p)->>'name'), ''),
    nullif(trim(p.username), ''),
    nullif(trim(pp.full_name), ''),
    nullif(trim(pp.username), ''),
    'النظام'
  ) as user_name,
  coalesce(
    nullif(trim(p.full_name), ''),
    nullif(trim(to_jsonb(p)->>'name'), ''),
    nullif(trim(p.username), ''),
    nullif(trim(pp.full_name), ''),
    nullif(trim(pp.username), ''),
    'النظام'
  ) as created_by_name,
  case
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
  and pp.tenant_id = im.tenant_id;

grant select on public.inventory_movements_view to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
