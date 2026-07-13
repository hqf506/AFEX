begin;

-- POS PINs are authentication credentials. Remove the legacy plaintext copy;
-- verification continues against the bcrypt hash through the server-only RPC.
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

-- RLS still limits rows by tenant and authorized role. Column privileges add a
-- second boundary: browser clients may read non-secret identity fields but can
-- never select the low-entropy PIN hashes from either profile table.
revoke select on table public.pos_profiles from public, anon, authenticated;
revoke select on table public.profiles from public, anon, authenticated;
revoke select (pos_pin_hash) on table public.pos_profiles
  from public, anon, authenticated;
revoke select (pos_pin_hash) on table public.profiles
  from public, anon, authenticated;

-- Full administrators may list safe identities across their tenant. Employees
-- are restricted to their assigned branch; cashiers have no direct table read.
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
        and coalesce(p.is_active, true) = true
        and (
          p.role in ('owner', 'admin', 'manager')
          or (
            p.role = 'employee'
            and p.branch_id is not null
            and p.branch_id = pos_profiles.branch_id
          )
        )
    )
  );

do $$
declare
  safe_columns text;
begin
  select string_agg(format('%I', column_name), ', ' order by ordinal_position)
  into safe_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'pos_profiles'
    and column_name <> 'pos_pin_hash';

  if safe_columns is not null then
    execute format(
      'grant select (%s) on table public.pos_profiles to authenticated',
      safe_columns
    );
  end if;

  select string_agg(format('%I', column_name), ', ' order by ordinal_position)
  into safe_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'profiles'
    and column_name <> 'pos_pin_hash';

  if safe_columns is not null then
    execute format(
      'grant select (%s) on table public.profiles to authenticated',
      safe_columns
    );
  end if;
end;
$$;

-- The application API supplies only its authenticated actor id. The database
-- derives tenant and branch scope from that actor instead of accepting a tenant
-- id from the caller. Only the service role may execute this verification path.
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
        when p.role in ('owner', 'admin', 'manager')
          then p_requested_branch_id
        else p.branch_id
      end as effective_branch_id
    from public.profiles p
    where p.id = p_actor_user_id
      and p.tenant_id is not null
      and p.role in ('owner', 'admin', 'manager', 'employee', 'cashier')
      and coalesce(p.is_active, true) = true
      and (
        p.role in ('owner', 'admin', 'manager')
        or p.branch_id is not null
      )
      and (
        p.role in ('owner', 'admin', 'manager')
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
        from public.branches b
        where b.id = actor_scope.effective_branch_id
          and b.tenant_id = actor_scope.tenant_id
      )
  )
  select
    pp.id,
    pp.username,
    pp.full_name,
    pp.role,
    pp.branch_id
  from public.pos_profiles pp
  cross join validated_scope scope
  where p_raw_pin ~ '^[0-9]{4}$'
    and pp.tenant_id = scope.tenant_id
    and pp.is_active = true
    and pp.role in ('cashier', 'employee', 'manager', 'admin')
    and pp.pos_pin_hash is not null
    and extensions.crypt(p_raw_pin, pp.pos_pin_hash) = pp.pos_pin_hash
    and (
      scope.effective_branch_id is null
      or pp.branch_id = scope.effective_branch_id
    )
  order by pp.created_at asc
$$;

revoke all on function public.verify_pos_pin_for_actor(text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.verify_pos_pin_for_actor(text, uuid, uuid)
  to service_role;

-- The application is deployed first with a missing-function fallback. Once this
-- migration runs, remove the legacy tenant-id-based function entirely.
drop function if exists public.verify_pos_pin(text, uuid, uuid);

notify pgrst, 'reload schema';

commit;
