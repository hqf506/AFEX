begin;

create extension if not exists pgcrypto;

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.branches (code, name, is_active)
values ('main', 'الفرع الرئيسي', true)
on conflict (code) do update
set
  name = excluded.name,
  is_active = true,
  updated_at = now();

alter table public.orders
  add column if not exists branch_id uuid null;

alter table public.invoices
  add column if not exists branch_id uuid null;

alter table public.customers
  add column if not exists branch_id uuid null;

alter table public.profiles
  add column if not exists branch_id uuid null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'orders_branch_id_fkey'
  ) then
    alter table public.orders
      add constraint orders_branch_id_fkey
      foreign key (branch_id) references public.branches (id)
      on update cascade
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'invoices_branch_id_fkey'
  ) then
    alter table public.invoices
      add constraint invoices_branch_id_fkey
      foreign key (branch_id) references public.branches (id)
      on update cascade
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'customers_branch_id_fkey'
  ) then
    alter table public.customers
      add constraint customers_branch_id_fkey
      foreign key (branch_id) references public.branches (id)
      on update cascade
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_branch_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_branch_id_fkey
      foreign key (branch_id) references public.branches (id)
      on update cascade
      on delete set null;
  end if;
end
$$;

with default_branch as (
  select id
  from public.branches
  where code = 'main'
  limit 1
)
update public.orders
set branch_id = default_branch.id
from default_branch
where public.orders.branch_id is null;

with default_branch as (
  select id
  from public.branches
  where code = 'main'
  limit 1
)
update public.invoices
set branch_id = default_branch.id
from default_branch
where public.invoices.branch_id is null;

with default_branch as (
  select id
  from public.branches
  where code = 'main'
  limit 1
)
update public.customers
set branch_id = default_branch.id
from default_branch
where public.customers.branch_id is null;

with default_branch as (
  select id
  from public.branches
  where code = 'main'
  limit 1
)
update public.profiles
set branch_id = default_branch.id
from default_branch
where public.profiles.branch_id is null;

create index if not exists idx_orders_branch_id
  on public.orders (branch_id);

create index if not exists idx_invoices_branch_id
  on public.invoices (branch_id);

create index if not exists idx_customers_branch_id
  on public.customers (branch_id);

create index if not exists idx_profiles_branch_id
  on public.profiles (branch_id);

create index if not exists idx_branches_is_active
  on public.branches (is_active);

commit;

-- Reversal notes (run manually only if needed and after verifying no code depends on branches):
-- alter table public.orders drop constraint if exists orders_branch_id_fkey;
-- alter table public.invoices drop constraint if exists invoices_branch_id_fkey;
-- alter table public.customers drop constraint if exists customers_branch_id_fkey;
-- alter table public.profiles drop constraint if exists profiles_branch_id_fkey;
-- drop index if exists public.idx_orders_branch_id;
-- drop index if exists public.idx_invoices_branch_id;
-- drop index if exists public.idx_customers_branch_id;
-- drop index if exists public.idx_profiles_branch_id;
-- drop index if exists public.idx_branches_is_active;
-- alter table public.orders drop column if exists branch_id;
-- alter table public.invoices drop column if exists branch_id;
-- alter table public.customers drop column if exists branch_id;
-- alter table public.profiles drop column if exists branch_id;
-- delete from public.branches where code = 'main';
-- drop table if exists public.branches;
