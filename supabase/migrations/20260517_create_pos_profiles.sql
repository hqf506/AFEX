begin;

create extension if not exists pgcrypto;

create table if not exists public.pos_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  username text not null,
  full_name text,
  phone text,
  pos_pin_hash text,
  role text not null default 'cashier',
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists pos_profiles_tenant_username_unique
  on public.pos_profiles (tenant_id, lower(username));

create index if not exists idx_pos_profiles_tenant_branch
  on public.pos_profiles (tenant_id, branch_id);

create index if not exists idx_pos_profiles_tenant_active
  on public.pos_profiles (tenant_id, is_active);

alter table public.pos_profiles enable row level security;

drop policy if exists pos_profiles_select_same_tenant_system_user
  on public.pos_profiles;

create policy pos_profiles_select_same_tenant_system_user
  on public.pos_profiles
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.tenant_id = pos_profiles.tenant_id
        and p.role in ('owner', 'admin', 'manager', 'employee')
        and coalesce(p.is_active, true) = true
    )
  );

insert into public.pos_profiles (
  id,
  tenant_id,
  branch_id,
  username,
  full_name,
  phone,
  pos_pin_hash,
  role,
  is_active,
  created_at,
  updated_at
)
select
  p.id,
  p.tenant_id,
  p.branch_id,
  lower(trim(p.username)),
  p.full_name,
  p.phone,
  p.pos_pin_hash,
  p.role,
  coalesce(p.is_active, true),
  coalesce(p.created_at, now()),
  coalesce(p.updated_at, now())
from public.profiles p
where p.tenant_id is not null
  and p.username is not null
  and p.role in ('cashier', 'employee')
on conflict do nothing;

create or replace function public.set_pos_pin(user_id uuid, raw_pin text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if raw_pin is null or raw_pin !~ '^[0-9]{4}$' then
    raise exception 'POS PIN must be exactly 4 digits';
  end if;

  update public.pos_profiles
  set
    pos_pin_hash = crypt(raw_pin, gen_salt('bf')),
    updated_at = now()
  where id = user_id;

  if not found then
    update public.profiles
    set
      pos_pin_hash = crypt(raw_pin, gen_salt('bf')),
      updated_at = now()
    where id = user_id;
  end if;
end;
$$;

create or replace function public.verify_pos_pin(raw_pin text, tenant_id uuid)
returns table (
  id uuid,
  username text,
  full_name text,
  role text,
  branch_id uuid
)
language sql
security definer
set search_path = public, extensions
as $$
  select
    pp.id,
    pp.username,
    pp.full_name,
    pp.role,
    pp.branch_id
  from public.pos_profiles pp
  where pp.tenant_id = $2
    and pp.is_active = true
    and pp.pos_pin_hash is not null
    and pp.pos_pin_hash = crypt(raw_pin, pp.pos_pin_hash)
  order by pp.created_at asc
  limit 1
$$;

revoke all on function public.set_pos_pin(uuid, text) from public;
grant execute on function public.set_pos_pin(uuid, text) to service_role;

revoke all on function public.verify_pos_pin(text, uuid) from public;
grant execute on function public.verify_pos_pin(text, uuid) to service_role;

commit;
