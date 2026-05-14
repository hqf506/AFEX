create table if not exists public.vat_settings (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'VAT',
  rate numeric not null default 15,
  is_active boolean not null default false,
  branch_id uuid null references public.branches(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vat_settings_name_not_blank check (char_length(btrim(name)) > 0),
  constraint vat_settings_rate_non_negative check (rate >= 0)
);

create unique index if not exists vat_settings_scope_unique_idx
  on public.vat_settings ((coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)));

create index if not exists vat_settings_branch_id_idx
  on public.vat_settings (branch_id);

create index if not exists vat_settings_is_active_idx
  on public.vat_settings (is_active);
