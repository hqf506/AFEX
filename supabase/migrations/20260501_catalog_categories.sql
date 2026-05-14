create table if not exists public.catalog_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_categories_name_not_blank check (char_length(btrim(name)) > 0)
);

insert into public.catalog_categories (name, is_active)
values
  ('الخدمات', true),
  ('المنتجات', true),
  ('تنظيف', true),
  ('إصلاح', true),
  ('عناية', true)
on conflict (name) do update
set is_active = excluded.is_active,
    updated_at = now();
