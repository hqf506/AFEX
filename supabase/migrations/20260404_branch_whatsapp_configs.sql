begin;

create extension if not exists pgcrypto;

create table if not exists public.branch_whatsapp_configs (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  provider text not null,
  phone_number text not null,
  instance_id text not null,
  token text not null,
  api_url text not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint branch_whatsapp_configs_branch_id_key unique (branch_id),
  constraint branch_whatsapp_configs_provider_check
    check (provider in ('ultramsg', 'meta'))
);

create index if not exists idx_branch_whatsapp_configs_branch_id
  on public.branch_whatsapp_configs (branch_id);

create index if not exists idx_branch_whatsapp_configs_is_active
  on public.branch_whatsapp_configs (is_active);

commit;
