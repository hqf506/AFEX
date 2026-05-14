alter table public.catalog_items
add column if not exists cost_price numeric not null default 0;
