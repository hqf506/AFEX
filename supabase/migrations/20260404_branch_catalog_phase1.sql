begin;

create extension if not exists pgcrypto;

create table if not exists public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  item_type text not null,
  category text not null,
  default_price numeric not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_items_item_type_check check (item_type in ('product', 'service'))
);

create table if not exists public.branch_catalog_items (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null,
  catalog_item_id uuid not null,
  price numeric not null,
  is_active boolean not null default true,
  display_order int null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint branch_catalog_items_branch_id_catalog_item_id_key unique (branch_id, catalog_item_id),
  constraint branch_catalog_items_branch_id_fkey
    foreign key (branch_id) references public.branches (id) on delete cascade,
  constraint branch_catalog_items_catalog_item_id_fkey
    foreign key (catalog_item_id) references public.catalog_items (id) on delete cascade
);

create index if not exists idx_branch_catalog_items_branch_id
  on public.branch_catalog_items (branch_id);

create index if not exists idx_branch_catalog_items_catalog_item_id
  on public.branch_catalog_items (catalog_item_id);

insert into public.catalog_items (
  code,
  name,
  item_type,
  category,
  default_price,
  is_active
)
values
  ('premium-cleaning', 'تنظيف فاخر', 'service', 'تنظيف', 120, true),
  ('leather-bag-repair', 'إصلاح شنطة جلد', 'service', 'إصلاح', 240, true),
  ('leather-protection-spray', 'بخاخ حماية جلد', 'product', 'عناية', 85, true),
  ('brown-leather-dye', 'صبغة جلد بني', 'product', 'ألوان', 65, true)
on conflict (code) do update
set
  name = excluded.name,
  item_type = excluded.item_type,
  category = excluded.category,
  default_price = excluded.default_price,
  is_active = excluded.is_active,
  updated_at = now();

with main_branch as (
  select id
  from public.branches
  where code = 'main'
  limit 1
),
seed_items as (
  select
    ci.id as catalog_item_id,
    ci.default_price as price,
    row_number() over (order by ci.code) as display_order
  from public.catalog_items ci
  where ci.code in (
    'premium-cleaning',
    'leather-bag-repair',
    'leather-protection-spray',
    'brown-leather-dye'
  )
)
insert into public.branch_catalog_items (
  branch_id,
  catalog_item_id,
  price,
  is_active,
  display_order
)
select
  mb.id,
  si.catalog_item_id,
  si.price,
  true,
  si.display_order
from main_branch mb
cross join seed_items si
on conflict (branch_id, catalog_item_id) do update
set
  price = excluded.price,
  is_active = excluded.is_active,
  display_order = excluded.display_order,
  updated_at = now();

commit;
