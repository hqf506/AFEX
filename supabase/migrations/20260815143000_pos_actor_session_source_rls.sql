/*
AFEX R5C — POS actor source-table RLS correction
REVIEW-ONLY: DO NOT EXECUTE UNTIL INDEPENDENTLY APPROVED.

Purpose:
  Permit only afex_pos_session_owner to read the three authoritative source
  relations used by the already-installed SECURITY DEFINER POS-session
  functions. No browser/application role receives new authority.
*/

begin;

set local statement_timeout = '30s';
set local lock_timeout = '5s';
set local idle_in_transaction_session_timeout = '60s';

do $preflight$
declare
  v_owner oid := pg_catalog.to_regrole('afex_pos_session_owner');
begin
  if v_owner is null then
    raise exception using errcode = 'P0001',
      message = 'R5C_POS_SESSION_OWNER_MISSING';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_roles r
    where r.oid = v_owner
      and r.rolcanlogin = false
      and r.rolinherit = false
      and r.rolsuper = false
      and r.rolbypassrls = false
  ) then
    raise exception using errcode = 'P0001',
      message = 'R5C_POS_SESSION_OWNER_IDENTITY_DRIFT';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('profiles', 'pos_profiles', 'branches')
      and c.relkind in ('r', 'p')
      and c.relrowsecurity = true
  ) <> 3 then
    raise exception using errcode = 'P0001',
      message = 'R5C_SOURCE_RELATION_RLS_IDENTITY_DRIFT';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policy p
    join pg_catalog.pg_class c on c.oid = p.polrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('profiles', 'pos_profiles', 'branches')
      and p.polname in (
        'pos_session_owner_profiles_read',
        'pos_session_owner_pos_profiles_read',
        'pos_session_owner_branches_read',
        'pos_session_owner_profiles_row_lock',
        'pos_session_owner_pos_profiles_row_lock',
        'pos_session_owner_branches_row_lock',
        'pos_session_owner_profiles_write_guard',
        'pos_session_owner_pos_profiles_write_guard',
        'pos_session_owner_branches_write_guard'
      )
  ) then
    raise exception using errcode = 'P0001',
      message = 'R5C_SOURCE_RLS_POLICY_ALREADY_PRESENT';
  end if;
end
$preflight$;

create policy pos_session_owner_profiles_read
on public.profiles
for select
to afex_pos_session_owner
using (true);

create policy pos_session_owner_pos_profiles_read
on public.pos_profiles
for select
to afex_pos_session_owner
using (true);

create policy pos_session_owner_branches_read
on public.branches
for select
to afex_pos_session_owner
using (true);

create policy pos_session_owner_profiles_row_lock
on public.profiles
for update
to afex_pos_session_owner
using (true)
with check (false);

create policy pos_session_owner_pos_profiles_row_lock
on public.pos_profiles
for update
to afex_pos_session_owner
using (true)
with check (false);

create policy pos_session_owner_branches_row_lock
on public.branches
for update
to afex_pos_session_owner
using (true)
with check (false);

create policy pos_session_owner_profiles_write_guard
on public.profiles
as restrictive
for update
to afex_pos_session_owner
using (true)
with check (false);

create policy pos_session_owner_pos_profiles_write_guard
on public.pos_profiles
as restrictive
for update
to afex_pos_session_owner
using (true)
with check (false);

create policy pos_session_owner_branches_write_guard
on public.branches
as restrictive
for update
to afex_pos_session_owner
using (true)
with check (false);

do $assertions$
declare
  v_actor_sessions_oid oid;
  v_auth_session_locks_oid oid;
  v_private_relation_count bigint;
begin
  select count(*)
  into v_private_relation_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'afex_pos_authority'
    and c.relname in ('actor_sessions', 'auth_session_locks')
    and c.relkind in ('r', 'p');

  if v_private_relation_count <> 2 then
    raise exception using errcode = 'P0001',
      message = 'R5C_PRIVATE_AUTHORITY_RELATION_IDENTITY_DRIFT';
  end if;

  select c.oid
  into strict v_actor_sessions_oid
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'afex_pos_authority'
    and c.relname = 'actor_sessions'
    and c.relkind in ('r', 'p');

  select c.oid
  into strict v_auth_session_locks_oid
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'afex_pos_authority'
    and c.relname = 'auth_session_locks'
    and c.relkind in ('r', 'p');

  if (
    select count(*)
    from pg_catalog.pg_policy p
    join pg_catalog.pg_class c on c.oid = p.polrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    join (
      values
        ('profiles', 'pos_session_owner_profiles_read'),
        ('pos_profiles', 'pos_session_owner_pos_profiles_read'),
        ('branches', 'pos_session_owner_branches_read')
    ) expected(relname, polname)
      on expected.relname = c.relname
     and expected.polname = p.polname
    where n.nspname = 'public'
      and p.polcmd = 'r'
      and p.polpermissive = true
      and p.polroles = array[pg_catalog.to_regrole('afex_pos_session_owner')::oid]
      and pg_catalog.pg_get_expr(p.polqual, p.polrelid) = 'true'
      and p.polwithcheck is null
  ) <> 3 then
    raise exception using errcode = 'P0001',
      message = 'R5C_SOURCE_RLS_READ_POLICY_ASSERTION_FAILED';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_policy p
    join pg_catalog.pg_class c on c.oid = p.polrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    join (
      values
        ('profiles', 'pos_session_owner_profiles_row_lock'),
        ('pos_profiles', 'pos_session_owner_pos_profiles_row_lock'),
        ('branches', 'pos_session_owner_branches_row_lock')
    ) expected(relname, polname)
      on expected.relname = c.relname
     and expected.polname = p.polname
    where n.nspname = 'public'
      and p.polcmd = 'w'
      and p.polpermissive = true
      and p.polroles = array[pg_catalog.to_regrole('afex_pos_session_owner')::oid]
      and pg_catalog.pg_get_expr(p.polqual, p.polrelid) = 'true'
      and pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) = 'false'
  ) <> 3 then
    raise exception using errcode = 'P0001',
      message = 'R5C_SOURCE_RLS_ROW_LOCK_POLICY_ASSERTION_FAILED';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_policy p
    join pg_catalog.pg_class c on c.oid = p.polrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    join (
      values
        ('profiles', 'pos_session_owner_profiles_write_guard'),
        ('pos_profiles', 'pos_session_owner_pos_profiles_write_guard'),
        ('branches', 'pos_session_owner_branches_write_guard')
    ) expected(relname, polname)
      on expected.relname = c.relname
     and expected.polname = p.polname
    where n.nspname = 'public'
      and p.polcmd = 'w'
      and p.polpermissive = false
      and p.polroles = array[pg_catalog.to_regrole('afex_pos_session_owner')::oid]
      and pg_catalog.pg_get_expr(p.polqual, p.polrelid) = 'true'
      and pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) = 'false'
  ) <> 3 then
    raise exception using errcode = 'P0001',
      message = 'R5C_SOURCE_RLS_WRITE_GUARD_POLICY_ASSERTION_FAILED';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_policy p
    join pg_catalog.pg_class c on c.oid = p.polrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and p.polname in (
        'pos_session_owner_profiles_read',
        'pos_session_owner_pos_profiles_read',
        'pos_session_owner_branches_read',
        'pos_session_owner_profiles_row_lock',
        'pos_session_owner_pos_profiles_row_lock',
        'pos_session_owner_branches_row_lock',
        'pos_session_owner_profiles_write_guard',
        'pos_session_owner_pos_profiles_write_guard',
        'pos_session_owner_branches_write_guard'
      )
  ) <> 9 then
    raise exception using errcode = 'P0001',
      message = 'R5C_SOURCE_RLS_POLICY_IDENTITY_DRIFT';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_auth_members m
    where m.member = pg_catalog.to_regrole('afex_pos_session_owner')::oid
  ) then
    raise exception using errcode = 'P0001',
      message = 'R5C_POS_SESSION_OWNER_APPLICABLE_MEMBERSHIP_DRIFT';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_policy p
    join pg_catalog.pg_class c on c.oid = p.polrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('profiles', 'pos_profiles', 'branches')
      and p.polcmd in ('w', '*')
      and (
        0::oid = any(p.polroles) or
        pg_catalog.to_regrole('afex_pos_session_owner')::oid = any(p.polroles)
      )
      and p.polname in (
        'pos_session_owner_profiles_row_lock',
        'pos_session_owner_pos_profiles_row_lock',
        'pos_session_owner_branches_row_lock',
        'pos_session_owner_profiles_write_guard',
        'pos_session_owner_pos_profiles_write_guard',
        'pos_session_owner_branches_write_guard'
      )
  ) <> 6 then
    raise exception using errcode = 'P0001',
      message = 'R5C_SOURCE_RLS_APPLICABLE_UPDATE_POLICY_DRIFT';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policy p
    join pg_catalog.pg_class c on c.oid = p.polrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('profiles', 'pos_profiles', 'branches')
      and p.polcmd in ('w', '*')
      and (
        0::oid = any(p.polroles) or
        pg_catalog.to_regrole('afex_pos_session_owner')::oid = any(p.polroles)
      )
      and p.polname not in (
        'pos_session_owner_profiles_row_lock',
        'pos_session_owner_pos_profiles_row_lock',
        'pos_session_owner_branches_row_lock',
        'pos_session_owner_profiles_write_guard',
        'pos_session_owner_pos_profiles_write_guard',
        'pos_session_owner_branches_write_guard'
      )
  ) then
    raise exception using errcode = 'P0001',
      message = 'R5C_SOURCE_RLS_UNEXPECTED_APPLICABLE_UPDATE_POLICY';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policy p
    join pg_catalog.pg_class c on c.oid = p.polrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('profiles', 'pos_profiles', 'branches')
      and (
        0::oid = any(p.polroles) or
        pg_catalog.to_regrole('afex_pos_session_owner')::oid = any(p.polroles)
      )
      and p.polcmd in ('a', 'd', '*')
  ) then
    raise exception using errcode = 'P0001',
      message = 'R5C_SOURCE_RLS_WRITE_POLICY_SCOPE_DRIFT';
  end if;

  if pg_catalog.has_schema_privilege(
       'service_role', 'afex_pos_authority', 'USAGE'
     ) or exists (
       select 1
       from (values
         (v_actor_sessions_oid),
         (v_auth_session_locks_oid)
       ) relation(relation_oid)
       cross join (values
         ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
         ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
       ) privilege(privilege_name)
       where pg_catalog.has_table_privilege(
         'service_role', relation.relation_oid, privilege.privilege_name
       )
     ) then
    raise exception using errcode = 'P0001',
      message = 'R5C_PRIVATE_AUTHORITY_BOUNDARY_DRIFT';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_roles r
    where r.rolname = 'afex_pos_session_owner'
      and r.rolcanlogin = false
      and r.rolinherit = false
      and r.rolsuper = false
      and r.rolbypassrls = false
  ) then
    raise exception using errcode = 'P0001',
      message = 'R5C_POS_SESSION_OWNER_IDENTITY_DRIFT';
  end if;
end
$assertions$;

commit;
