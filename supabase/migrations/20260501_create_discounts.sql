create table if not exists public.discounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null,
  value numeric not null,
  is_active boolean not null default true,
  branch_id uuid null references public.branches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  constraint discounts_name_not_blank check (char_length(btrim(name)) > 0),
  constraint discounts_type_check check (type in ('percentage', 'fixed')),
  constraint discounts_value_non_negative check (value >= 0)
);

create index if not exists discounts_branch_id_idx
  on public.discounts (branch_id);

create index if not exists discounts_deleted_at_idx
  on public.discounts (deleted_at);

create index if not exists discounts_is_active_idx
  on public.discounts (is_active);
