alter table public.announcements
  drop constraint if exists announcements_audience_type_check;

alter table public.announcements
  add constraint announcements_audience_type_check
  check (audience_type in ('all_customers', 'branch_customers', 'manual_customers'));

create table if not exists public.announcement_manual_customers (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  tenant_id uuid not null,
  customer_id uuid not null references public.customers(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (announcement_id, customer_id)
);

create index if not exists idx_announcement_manual_customers_tenant
  on public.announcement_manual_customers (tenant_id, announcement_id);

alter table public.announcement_manual_customers enable row level security;

drop policy if exists announcement_manual_customers_full_admin_select
  on public.announcement_manual_customers;
create policy announcement_manual_customers_full_admin_select
on public.announcement_manual_customers
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.tenant_id = announcement_manual_customers.tenant_id
      and p.role in ('admin', 'manager', 'owner')
      and coalesce(p.is_active, true) = true
  )
);

grant select, insert, update, delete on public.announcement_manual_customers
  to authenticated, service_role;

notify pgrst, 'reload schema';
