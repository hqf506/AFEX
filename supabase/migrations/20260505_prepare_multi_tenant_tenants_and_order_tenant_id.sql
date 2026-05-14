begin;

create table if not exists public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

alter table public.profiles
add column if not exists tenant_id uuid;

alter table public.orders
add column if not exists tenant_id uuid;

commit;
