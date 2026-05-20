create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  branch_id uuid null references public.branches(id) on delete set null,
  title text not null,
  message text not null,
  announcement_type text not null check (
    announcement_type in (
      'discount',
      'seasonal_offer',
      'discount_code',
      'general_alert',
      'marketing_campaign'
    )
  ),
  discount_code text null,
  audience_type text not null default 'all_customers' check (
    audience_type in ('all_customers', 'branch_customers')
  ),
  status text not null default 'draft' check (
    status in ('draft', 'links_generated', 'archived')
  ),
  created_by uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.announcement_recipients (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  tenant_id uuid not null,
  branch_id uuid null,
  customer_id uuid not null references public.customers(id) on delete cascade,
  customer_name text null,
  phone text not null,
  whatsapp_url text not null,
  send_status text not null default 'link_generated' check (
    send_status in ('pending', 'link_generated', 'sent', 'failed', 'skipped')
  ),
  created_at timestamptz not null default now(),
  unique (announcement_id, customer_id)
);

create index if not exists idx_announcements_tenant_created
  on public.announcements (tenant_id, created_at desc);

create index if not exists idx_announcements_tenant_branch
  on public.announcements (tenant_id, branch_id);

create index if not exists idx_announcement_recipients_announcement
  on public.announcement_recipients (announcement_id);

create index if not exists idx_announcement_recipients_tenant_status
  on public.announcement_recipients (tenant_id, send_status);

create or replace function public.set_announcement_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_set_announcement_updated_at on public.announcements;
create trigger trg_set_announcement_updated_at
before update on public.announcements
for each row
execute function public.set_announcement_updated_at();

alter table public.announcements enable row level security;
alter table public.announcement_recipients enable row level security;

drop policy if exists announcements_full_admin_select on public.announcements;
create policy announcements_full_admin_select
on public.announcements
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.tenant_id = announcements.tenant_id
      and p.role in ('admin', 'manager', 'owner')
      and coalesce(p.is_active, true) = true
  )
);

drop policy if exists announcement_recipients_full_admin_select on public.announcement_recipients;
create policy announcement_recipients_full_admin_select
on public.announcement_recipients
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.tenant_id = announcement_recipients.tenant_id
      and p.role in ('admin', 'manager', 'owner')
      and coalesce(p.is_active, true) = true
  )
);

grant select, insert, update, delete on public.announcements to authenticated, service_role;
grant select, insert, update, delete on public.announcement_recipients to authenticated, service_role;

notify pgrst, 'reload schema';
