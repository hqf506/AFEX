begin;

create extension if not exists pgcrypto;

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid null references public.tenants(id) on delete set null,
  branch_id uuid null references public.branches(id) on delete set null,
  actor_user_id uuid null references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text null,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text null,
  user_agent text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_tenant_created
  on public.audit_logs (tenant_id, created_at desc);

create index if not exists idx_audit_logs_actor_created
  on public.audit_logs (actor_user_id, created_at desc);

create index if not exists idx_audit_logs_entity
  on public.audit_logs (entity_type, entity_id);

alter table public.audit_logs enable row level security;

drop policy if exists audit_logs_select_same_tenant_admin
  on public.audit_logs;

create policy audit_logs_select_same_tenant_admin
on public.audit_logs
for select
to authenticated
using (
  tenant_id in (
    select p.tenant_id
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'manager')
      and p.is_active = true
  )
);

commit;
