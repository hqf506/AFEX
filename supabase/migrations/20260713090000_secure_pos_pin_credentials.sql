begin;

-- AFEX POS PIN credentials must remain server-only. Revoke hash-column access
-- before replacing broad table privileges. The legacy plaintext column is
-- removed transactionally below, which eliminates all future access to it.
revoke select (pos_pin_hash)
  on table public.pos_profiles
  from PUBLIC, anon, authenticated;
revoke insert (pos_pin_hash)
  on table public.pos_profiles
  from PUBLIC, anon, authenticated;
revoke update (pos_pin_hash)
  on table public.pos_profiles
  from PUBLIC, anon, authenticated;

revoke select (pos_pin_hash)
  on table public.profiles
  from PUBLIC, anon, authenticated;
revoke insert (pos_pin_hash)
  on table public.profiles
  from PUBLIC, anon, authenticated;
revoke update (pos_pin_hash, role, branch_id, is_active)
  on table public.profiles
  from PUBLIC, anon, authenticated;

-- Browser clients do not create, delete, or mutate POS profiles. All POS user
-- administration, including PIN creation/reset, uses authenticated server APIs
-- backed by service_role. Remove every direct browser mutation privilege.
revoke insert, update, delete
  on table public.pos_profiles
  from PUBLIC, anon, authenticated;

-- public.profiles is a core auth table. Browser clients only update their own
-- display/contact fields through /api/account; current RLS continues to decide
-- which row may be changed. Administrative mutations remain service-role-only.
revoke insert, update, delete
  on table public.profiles
  from PUBLIC, anon, authenticated;
grant update (full_name, phone, contact_email, updated_at)
  on table public.profiles
  to authenticated;

-- Replace broad table SELECT grants with reviewed, explicit safe projections.
-- No view is required because every current consumer already selects explicit
-- columns and existing profiles RLS remains unchanged.
revoke select
  on table public.profiles
  from PUBLIC, anon, authenticated;
grant select (
  id,
  username,
  full_name,
  role,
  is_active,
  branch_id,
  tenant_id,
  tenant_name,
  contact_email,
  phone
)
  on table public.profiles
  to authenticated;

revoke select
  on table public.pos_profiles
  from PUBLIC, anon, authenticated;
grant select (
  id,
  tenant_id,
  username,
  full_name,
  role
)
  on table public.pos_profiles
  to authenticated;

-- Replace the caller-supplied-tenant verification path before removing it.
-- The replacement derives tenant and effective branch from the authenticated
-- actor identified by the server API. It returns every active match so the API
-- can preserve the existing duplicate-PIN rejection behavior (HTTP 409).
create or replace function public.verify_pos_pin_for_actor(
  p_raw_pin text,
  p_actor_user_id uuid,
  p_requested_branch_id uuid default null
)
returns table (
  id uuid,
  username text,
  full_name text,
  role text,
  branch_id uuid
)
language sql
security definer
set search_path = pg_catalog
as $$
  with actor_scope as (
    select
      p.tenant_id,
      p.branch_id,
      p.role,
      case
        when p.role::text in ('owner', 'admin', 'manager')
          then p_requested_branch_id
        else p.branch_id
      end as effective_branch_id
    from public.profiles as p
    where p.id = p_actor_user_id
      and p.tenant_id is not null
      and p.role::text in ('owner', 'admin', 'manager', 'employee', 'cashier')
      and coalesce(p.is_active, true) = true
      and (
        p.role::text in ('owner', 'admin', 'manager')
        or p.branch_id is not null
      )
      and (
        p.role::text in ('owner', 'admin', 'manager')
        or p_requested_branch_id is null
        or p_requested_branch_id = p.branch_id
      )
  ),
  validated_scope as (
    select actor_scope.*
    from actor_scope
    where actor_scope.effective_branch_id is null
      or exists (
        select 1
        from public.branches as b
        where b.id = actor_scope.effective_branch_id
          and b.tenant_id = actor_scope.tenant_id
      )
  )
  select
    pp.id::uuid as id,
    pp.username::text as username,
    pp.full_name::text as full_name,
    pp.role::text as role,
    pp.branch_id::uuid as branch_id
  from public.pos_profiles as pp
  cross join validated_scope as scope
  where p_raw_pin ~ '^[0-9]{4}$'
    and pp.tenant_id = scope.tenant_id
    and pp.is_active = true
    and pp.role::text in ('cashier', 'employee', 'manager', 'admin')
    and pp.pos_pin_hash is not null
    and extensions.crypt(p_raw_pin, pp.pos_pin_hash) = pp.pos_pin_hash
    and (
      scope.effective_branch_id is null
      or pp.branch_id = scope.effective_branch_id
    )
  order by pp.created_at asc
$$;

revoke all on function public.verify_pos_pin_for_actor(text, uuid, uuid)
  from PUBLIC, anon, authenticated;
grant execute on function public.verify_pos_pin_for_actor(text, uuid, uuid)
  to service_role;

-- Remove both historical verification signatures. The application-first build
-- contains a narrow missing-function fallback until this migration is applied.
drop function if exists public.verify_pos_pin(text, uuid, uuid);
drop function if exists public.verify_pos_pin(text, uuid);

-- No tracked function, view, trigger, or policy depends on pos_pin_plain. This
-- non-CASCADE drop intentionally aborts the transaction if production contains
-- an unreviewed dependency not represented in source control.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pos_profiles'
      and column_name = 'pos_pin_plain'
  ) then
    update public.pos_profiles
    set pos_pin_plain = null
    where pos_pin_plain is not null;

    alter table public.pos_profiles
      drop column pos_pin_plain;
  end if;
end;
$$;

-- Full administrators may read safe POS identities across their tenant.
-- Employees are limited to their assigned branch. Cashiers and anonymous users
-- receive no direct rows, and no browser role can select credential columns.
drop policy if exists pos_profiles_select_same_tenant_system_user
  on public.pos_profiles;

create policy pos_profiles_select_same_tenant_system_user
  on public.pos_profiles
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles as p
      where p.id = auth.uid()
        and p.tenant_id = pos_profiles.tenant_id
        and coalesce(p.is_active, true) = true
        and (
          p.role::text in ('owner', 'admin', 'manager')
          or (
            p.role::text = 'employee'
            and p.branch_id is not null
            and p.branch_id = pos_profiles.branch_id
          )
        )
    )
  );

notify pgrst, 'reload schema';

commit;
