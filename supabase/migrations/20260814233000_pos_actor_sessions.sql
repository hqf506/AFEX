begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $temporary_login_installer_preflight$
declare
  v_session oid := (select oid from pg_catalog.pg_roles where rolname = session_user);
  v_current oid := (select oid from pg_catalog.pg_roles where rolname = current_user);
begin
  if v_session is null or v_current is null or not exists (
    select 1 from pg_catalog.pg_roles
    where oid = v_session
      and rolcanlogin
      and not rolsuper
      and not rolcreaterole
  ) then
    raise exception 'POS_SESSION_TEMPORARY_LOGIN_IDENTITY_INVALID';
  end if;
  if not pg_catalog.pg_has_role(session_user, 'postgres', 'SET') then
    raise exception 'POS_SESSION_POSTGRES_SET_AUTHORITY_MISSING';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_roles
    where rolname = 'postgres'
      and rolcanlogin
      and not rolsuper
      and rolcreaterole
  ) then
    raise exception 'POS_SESSION_POSTGRES_INSTALLER_INVALID';
  end if;
  if current_user <> session_user and current_user <> 'postgres' then
    raise exception 'POS_SESSION_RUNNER_EFFECTIVE_ROLE_INVALID';
  end if;
  if current_user = session_user and current_user = 'postgres' then
    raise exception 'POS_SESSION_TEMPORARY_LOGIN_IDENTITY_INVALID';
  end if;
  if current_user = 'postgres' and not exists (
    select 1 from pg_catalog.pg_roles
    where oid = v_current
      and rolcanlogin
      and not rolsuper
      and rolcreaterole
  ) then
    raise exception 'POS_SESSION_POSTGRES_INSTALLER_INVALID';
  end if;
  if exists (
    select 1
    from pg_catalog.pg_auth_members m
    join pg_catalog.pg_roles r on r.oid = m.roleid
    where m.member = v_session
      and r.rolname like 'afex_%'
      and (m.set_option or m.inherit_option)
  ) then
    raise exception 'POS_SESSION_TEMPORARY_LOGIN_AFEX_AUTHORITY_UNEXPECTED';
  end if;
  if exists (select 1 from pg_catalog.pg_roles where rolname in ('afex_pos_session_owner','afex_pos_session_maintenance')) or
     to_regnamespace('afex_pos_authority') is not null or
     to_regprocedure('public.issue_pos_actor_session_v1(text,uuid,uuid,text,uuid)') is not null or
     to_regprocedure('public.validate_pos_actor_session_v1(text,uuid,uuid)') is not null or
     to_regprocedure('public.pos_actor_session_state_v1(uuid,uuid)') is not null or
     to_regprocedure('public.revoke_pos_actor_session_v1(text,uuid,uuid,text)') is not null or
     to_regprocedure('public.revoke_pos_actor_sessions_for_actor_v1(uuid,uuid,uuid,text)') is not null or
     to_regprocedure('public.cleanup_pos_actor_sessions_v1(integer)') is not null then
    raise exception using errcode = '55000', message = 'POS_SESSION_AUTHORITY_ALREADY_PRESENT';
  end if;
end
$temporary_login_installer_preflight$;

select case
  when current_user = session_user then pg_catalog.set_config('role', 'postgres', true)
  else pg_catalog.current_setting('role', true)
end as installer_role_activation;

do $installer_and_creator_topology_preflight$
declare
  v_installer oid := (select oid from pg_catalog.pg_roles where rolname = current_user);
  v_core_creator_edge_count integer;
  v_core_creator_grantor_count integer;
begin
  if current_user <> 'postgres' or current_user = session_user or
     pg_catalog.current_setting('role', true) <> 'postgres' or
     v_installer is null or not exists (
    select 1 from pg_catalog.pg_roles
    where oid = v_installer
      and rolcanlogin
      and not rolsuper
      and rolcreaterole
  ) then
    raise exception 'POS_SESSION_INSTALLER_IDENTITY_INVALID';
  end if;

  select count(*), count(distinct m.grantor)
  into v_core_creator_edge_count, v_core_creator_grantor_count
  from pg_catalog.pg_auth_members m
  join pg_catalog.pg_roles r on r.oid = m.roleid
  where r.rolname in (
    'afex_context_issuer', 'afex_core_owner', 'afex_core_runtime',
    'afex_function_owner', 'afex_outbox_worker'
  )
    and m.member = v_installer
    and m.grantor <> v_installer
    and m.admin_option
    and not m.inherit_option
    and not m.set_option;

  if v_core_creator_edge_count <> 5 or
     v_core_creator_grantor_count <> 1 or
     exists (
       select 1
       from pg_catalog.pg_auth_members m
       join pg_catalog.pg_roles r on r.oid = m.roleid
       where r.rolname in (
         'afex_context_issuer', 'afex_core_owner', 'afex_core_runtime',
         'afex_function_owner', 'afex_outbox_worker'
       )
         and m.member = v_installer
         and m.grantor <> v_installer
         and not (
           m.admin_option and not m.inherit_option and not m.set_option
         )
     ) then
    raise exception 'POS_SESSION_CREATOR_TOPOLOGY_INVALID';
  end if;
end
$installer_and_creator_topology_preflight$;

do $preflight$
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname in ('afex_pos_session_owner','afex_pos_session_maintenance')) or
     to_regnamespace('afex_pos_authority') is not null or
     to_regprocedure('public.issue_pos_actor_session_v1(text,uuid,uuid,text,uuid)') is not null or
     to_regprocedure('public.validate_pos_actor_session_v1(text,uuid,uuid)') is not null or
     to_regprocedure('public.pos_actor_session_state_v1(uuid,uuid)') is not null or
     to_regprocedure('public.revoke_pos_actor_session_v1(text,uuid,uuid,text)') is not null or
     to_regprocedure('public.revoke_pos_actor_sessions_for_actor_v1(uuid,uuid,uuid,text)') is not null or
     to_regprocedure('public.cleanup_pos_actor_sessions_v1(integer)') is not null then
    raise exception using errcode = '55000', message = 'POS_SESSION_AUTHORITY_ALREADY_PRESENT';
  end if;
  create role afex_pos_session_owner nologin noinherit nosuperuser nocreatedb nocreaterole noreplication;
  create role afex_pos_session_maintenance nologin noinherit nosuperuser nocreatedb nocreaterole noreplication;
end
$preflight$;

do $created_role_creator_edges$
declare
  v_installer oid := (select oid from pg_catalog.pg_roles where rolname = current_user);
  v_expected_count integer;
  v_actual_count integer;
  v_grantor_count integer;
begin
  v_expected_count := 2;

  select count(*), count(distinct m.grantor)
  into v_actual_count, v_grantor_count
  from pg_catalog.pg_auth_members m
  join pg_catalog.pg_roles r on r.oid = m.roleid
  where r.rolname in ('afex_pos_session_owner','afex_pos_session_maintenance')
    and m.member = v_installer
    and m.grantor <> v_installer
    and m.admin_option
    and not m.inherit_option
    and not m.set_option;

  if v_actual_count <> v_expected_count or
     v_grantor_count <> 1 or
     (select min(m.grantor) from pg_catalog.pg_auth_members m
      join pg_catalog.pg_roles r on r.oid=m.roleid
      where r.rolname in ('afex_pos_session_owner','afex_pos_session_maintenance')
        and m.member=v_installer and m.admin_option
        and not m.inherit_option and not m.set_option) <>
     (select min(m.grantor) from pg_catalog.pg_auth_members m
      join pg_catalog.pg_roles r on r.oid=m.roleid
      where r.rolname in (
        'afex_context_issuer','afex_core_owner','afex_core_runtime',
        'afex_function_owner','afex_outbox_worker'
      ) and m.member=v_installer and m.admin_option
        and not m.inherit_option and not m.set_option) or
     exists (
       select 1 from pg_catalog.pg_auth_members m
       join pg_catalog.pg_roles r on r.oid = m.roleid
       where r.rolname in ('afex_pos_session_owner','afex_pos_session_maintenance')
         and not (
           m.member = v_installer and
           m.grantor <> v_installer and
           m.admin_option and
           not m.inherit_option and
           not m.set_option
         )
     ) then
    raise exception 'POS_SESSION_CREATED_ROLE_CREATOR_EDGES_INVALID';
  end if;
end
$created_role_creator_edges$;

do $temporary_owner_edge$
declare
  v_role text;
  v_creator_grantor name;
begin
  for v_role in select unnest(array['afex_pos_session_owner','afex_pos_session_maintenance']) loop
    select g.rolname into strict v_creator_grantor
    from pg_catalog.pg_auth_members m
    join pg_catalog.pg_roles r on r.oid=m.roleid
    join pg_catalog.pg_roles member_role on member_role.oid=m.member
    join pg_catalog.pg_roles g on g.oid=m.grantor
    where r.rolname=v_role and member_role.rolname=current_user
      and m.admin_option and not m.inherit_option and not m.set_option;

    if v_creator_grantor = current_user then
      execute format(
        'grant %I to %I with admin true, inherit false, set true granted by %I',
        v_role, current_user, current_user
      );
    else
      execute format(
        'grant %I to %I with admin false, inherit false, set true granted by %I',
        v_role, current_user, current_user
      );
    end if;
  end loop;
end
$temporary_owner_edge$;

do $temporary_owner_edge_assertions$
declare
  v_installer oid := (select oid from pg_catalog.pg_roles where rolname=current_user);
begin
  if (select count(*) from pg_catalog.pg_auth_members m
      join pg_catalog.pg_roles r on r.oid=m.roleid
      where r.rolname in ('afex_pos_session_owner','afex_pos_session_maintenance')
        and m.member=v_installer and m.grantor<>v_installer
        and m.admin_option and not m.inherit_option and not m.set_option) <> 2 or
     (select count(*) from pg_catalog.pg_auth_members m
      join pg_catalog.pg_roles r on r.oid=m.roleid
      where r.rolname in ('afex_pos_session_owner','afex_pos_session_maintenance')
        and m.member=v_installer and m.grantor=v_installer
        and not m.admin_option and not m.inherit_option and m.set_option) <> 2 or
     (select count(*) from pg_catalog.pg_auth_members m
      join pg_catalog.pg_roles r on r.oid=m.roleid
      where r.rolname in ('afex_pos_session_owner','afex_pos_session_maintenance')) <> 4 then
    raise exception 'POS_SESSION_TEMPORARY_OWNER_EDGE_LIFECYCLE_INVALID';
  end if;
end
$temporary_owner_edge_assertions$;

create schema afex_pos_authority authorization afex_pos_session_owner;
alter schema afex_pos_authority owner to afex_pos_session_owner;
grant usage, create on schema public to afex_pos_session_owner;
set local role afex_pos_session_owner;
revoke all on schema afex_pos_authority from public, anon, authenticated, service_role;
grant usage on schema afex_pos_authority to afex_pos_session_owner;

alter default privileges for role afex_pos_session_owner in schema afex_pos_authority
  revoke all on tables from public, anon, authenticated, service_role;
alter default privileges for role afex_pos_session_owner in schema afex_pos_authority
  revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges for role afex_pos_session_owner in schema afex_pos_authority
  revoke execute on functions from public, anon, authenticated, service_role;

create table afex_pos_authority.actor_sessions (
  session_id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  authenticated_subject_id uuid not null,
  tenant_id uuid not null,
  branch_id uuid not null,
  actor_id uuid not null,
  actor_role text not null,
  actor_version timestamptz not null,
  credential_fingerprint text not null,
  authenticated_session_id uuid not null,
  session_version bigint not null default 1,
  issued_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revocation_reason text,
  constraint actor_sessions_token_hash_format
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint actor_sessions_credential_fingerprint_format
    check (credential_fingerprint ~ '^afex-pos-pin-v1:[0-9a-f]{64}$'),
  constraint actor_sessions_role_closed
    check (actor_role in ('admin', 'manager', 'employee', 'cashier')),
  constraint actor_sessions_lifetime_bounded
    check (expires_at > issued_at and expires_at <= issued_at + interval '8 hours'),
  constraint actor_sessions_revocation_pair
    check ((revoked_at is null) = (revocation_reason is null)),
  constraint actor_sessions_revocation_time
    check (revoked_at is null or revoked_at >= issued_at),
  constraint actor_sessions_revocation_reason_closed
    check (revocation_reason is null or revocation_reason in (
      'LOGOUT', 'LOCKED', 'ACTOR_DISABLED', 'ACTOR_DELETED', 'PIN_CHANGED',
      'ROLE_CHANGED', 'BRANCH_CHANGED', 'TENANT_CHANGED', 'AUTH_LOGOUT',
      'EXPIRED', 'ADMIN_REAUTH', 'SUPERSEDED', 'SECURITY_RESET',
      'SUBJECT_DISABLED', 'SUBJECT_DELETED', 'SUBJECT_TENANT_CHANGED',
      'SUBJECT_ROLE_CHANGED'
    )),
  constraint actor_sessions_session_version_positive check (session_version > 0)
);

create table afex_pos_authority.auth_session_locks (
  authenticated_subject_id uuid not null,
  authenticated_session_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  authority_issued_at timestamptz,
  constraint auth_session_locks_issuance_time
    check (authority_issued_at is null or authority_issued_at >= created_at),
  primary key (authenticated_subject_id, authenticated_session_id)
);

alter table afex_pos_authority.actor_sessions owner to afex_pos_session_owner;
alter table afex_pos_authority.actor_sessions enable row level security;
alter table afex_pos_authority.actor_sessions force row level security;
alter table afex_pos_authority.auth_session_locks owner to afex_pos_session_owner;
alter table afex_pos_authority.auth_session_locks enable row level security;
alter table afex_pos_authority.auth_session_locks force row level security;
revoke all on table afex_pos_authority.actor_sessions
  from public, anon, authenticated, service_role;
revoke all on table afex_pos_authority.auth_session_locks
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on table afex_pos_authority.actor_sessions
  to afex_pos_session_owner;
grant select, insert, update, delete on table afex_pos_authority.auth_session_locks
  to afex_pos_session_owner;

create unique index actor_sessions_auth_session_active_uidx
  on afex_pos_authority.actor_sessions
    (authenticated_subject_id, authenticated_session_id)
  where revoked_at is null;
create index actor_sessions_subject_active_idx
  on afex_pos_authority.actor_sessions (authenticated_subject_id, expires_at)
  where revoked_at is null;
create index actor_sessions_actor_active_idx
  on afex_pos_authority.actor_sessions (actor_id, expires_at)
  where revoked_at is null;
create index actor_sessions_expiry_idx
  on afex_pos_authority.actor_sessions (expires_at)
  where revoked_at is null;
create index actor_sessions_revoked_retention_idx
  on afex_pos_authority.actor_sessions (revoked_at)
  where revoked_at is not null;

create function afex_pos_authority.enforce_actor_session_transition()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if row(
    new.session_id, new.token_hash, new.authenticated_subject_id, new.tenant_id,
    new.branch_id, new.actor_id, new.actor_role, new.actor_version,
    new.credential_fingerprint, new.authenticated_session_id,
    new.session_version, new.issued_at, new.expires_at
  ) is distinct from row(
    old.session_id, old.token_hash, old.authenticated_subject_id, old.tenant_id,
    old.branch_id, old.actor_id, old.actor_role, old.actor_version,
    old.credential_fingerprint, old.authenticated_session_id,
    old.session_version, old.issued_at, old.expires_at
  ) then
    raise exception using errcode = '22023', message = 'POS_SESSION_ISSUANCE_IMMUTABLE';
  end if;
  if old.revoked_at is not null and
     (new.revoked_at is distinct from old.revoked_at or
      new.revocation_reason is distinct from old.revocation_reason) then
    raise exception using errcode = '22023', message = 'POS_SESSION_REVOCATION_IMMUTABLE';
  end if;
  if old.revoked_at is null and new.revoked_at is null and
     new.revocation_reason is not null then
    raise exception using errcode = '22023', message = 'POS_SESSION_REVOCATION_INVALID';
  end if;
  return new;
end
$function$;

alter function afex_pos_authority.enforce_actor_session_transition()
  owner to afex_pos_session_owner;
revoke all on function afex_pos_authority.enforce_actor_session_transition()
  from public, anon, authenticated, service_role;

create trigger actor_sessions_transition_guard
before update on afex_pos_authority.actor_sessions
for each row execute function afex_pos_authority.enforce_actor_session_transition();

create policy actor_sessions_owner_policy
on afex_pos_authority.actor_sessions
for all to afex_pos_session_owner
using (true) with check (true);

create policy auth_session_locks_owner_policy
on afex_pos_authority.auth_session_locks
for all to afex_pos_session_owner
using (true) with check (true);

create function public.issue_pos_actor_session_v1(
  p_token_hash text,
  p_authenticated_session_id uuid,
  p_authenticated_subject_id uuid,
  p_raw_pin text,
  p_requested_branch_id uuid default null
)
returns table (
  session_id uuid,
  expires_at timestamptz,
  actor_id uuid,
  tenant_id uuid,
  branch_id uuid,
  actor_role text
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_profile public.profiles%rowtype;
  v_actor record;
  v_verified_actor_id uuid;
  v_verified_actor_ids uuid[];
  v_reverified_actor_ids uuid[];
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or
     p_authenticated_session_id is null or
     p_authenticated_subject_id is null or p_raw_pin is null or
     p_raw_pin !~ '^[0-9]{4}$' then
    raise exception using errcode = '22023', message = 'POS_SESSION_INPUT_INVALID';
  end if;

  select p.* into v_profile
  from public.profiles p
  where p.id = p_authenticated_subject_id
    and p.is_active = true
  for share of p;
  if not found or v_profile.tenant_id is null or
     v_profile.role not in ('owner', 'admin', 'manager', 'employee', 'cashier') then
    raise exception using errcode = '42501', message = 'POS_SESSION_SUBJECT_UNAUTHORIZED';
  end if;

  insert into afex_pos_authority.auth_session_locks as l (
    authenticated_subject_id, authenticated_session_id
  ) values (p_authenticated_subject_id, p_authenticated_session_id)
  on conflict (authenticated_subject_id, authenticated_session_id)
  do update set created_at = l.created_at;

  select array_agg(x.id order by x.id) into v_verified_actor_ids
  from public.verify_pos_pin_for_actor(
    p_raw_pin, p_authenticated_subject_id, p_requested_branch_id
  ) x;
  if coalesce(cardinality(v_verified_actor_ids), 0) <> 1 then
    raise exception using errcode = '28000', message = 'POS_SESSION_PIN_REJECTED';
  end if;
  v_verified_actor_id := v_verified_actor_ids[1];

  select pp.id, pp.tenant_id, pp.branch_id, pp.role, pp.updated_at, pp.pos_pin_hash
  into v_actor
  from public.pos_profiles pp
  join public.branches b on b.id = pp.branch_id and b.tenant_id = pp.tenant_id
  where pp.id = v_verified_actor_id
    and pp.tenant_id = v_profile.tenant_id
    and pp.is_active = true
    and pp.role in ('admin', 'manager', 'employee', 'cashier')
    and pp.pos_pin_hash is not null
    and b.is_active = true
  for share of pp, b;
  if not found then
    raise exception using errcode = '42501', message = 'POS_SESSION_SCOPE_INVALID';
  end if;

  -- The first PIN lookup identifies the row to lock. Re-run the authoritative
  -- verifier only after the actor and branch locks are held so an old PIN can
  -- never be paired with a newly changed credential fingerprint.
  select array_agg(x.id order by x.id) into v_reverified_actor_ids
  from public.verify_pos_pin_for_actor(
    p_raw_pin, p_authenticated_subject_id, p_requested_branch_id
  ) x;
  if coalesce(cardinality(v_reverified_actor_ids), 0) <> 1 or
     v_reverified_actor_ids[1] is distinct from v_actor.id then
    raise exception using errcode = '28000', message = 'POS_SESSION_PIN_REJECTED';
  end if;

  update afex_pos_authority.actor_sessions s
  set revoked_at = v_now, revocation_reason = 'SUPERSEDED'
  where s.authenticated_subject_id = p_authenticated_subject_id
    and s.authenticated_session_id = p_authenticated_session_id
    and s.revoked_at is null;

  update afex_pos_authority.auth_session_locks l
  set authority_issued_at = coalesce(
    l.authority_issued_at, greatest(l.created_at, v_now)
  )
  where l.authenticated_subject_id = p_authenticated_subject_id
    and l.authenticated_session_id = p_authenticated_session_id;

  return query
  insert into afex_pos_authority.actor_sessions as s (
    token_hash, authenticated_subject_id, tenant_id, branch_id, actor_id,
    actor_role, actor_version, credential_fingerprint,
    authenticated_session_id, issued_at, expires_at
  ) values (
    p_token_hash, p_authenticated_subject_id, v_actor.tenant_id,
    v_actor.branch_id, v_actor.id, v_actor.role, v_actor.updated_at,
    'afex-pos-pin-v1:' || encode(
      extensions.digest(
        convert_to('afex-pos-pin-v1:' || v_actor.pos_pin_hash, 'UTF8'), 'sha256'
      ), 'hex'
    ),
    p_authenticated_session_id, v_now, v_now + interval '8 hours'
  )
  returning s.session_id, s.expires_at, s.actor_id, s.tenant_id,
    s.branch_id, s.actor_role;
end
$function$;

create function public.validate_pos_actor_session_v1(
  p_token_hash text,
  p_authenticated_session_id uuid,
  p_authenticated_subject_id uuid
)
returns table (
  session_id uuid,
  actor_id uuid,
  tenant_id uuid,
  branch_id uuid,
  actor_role text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_session afex_pos_authority.actor_sessions%rowtype;
  v_profile public.profiles%rowtype;
  v_actor public.pos_profiles%rowtype;
  v_branch public.branches%rowtype;
  v_reason text;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or
     p_authenticated_session_id is null or
     p_authenticated_subject_id is null then
    raise exception using errcode = '28000', message = 'POS_SESSION_INVALID';
  end if;

  select s.* into v_session
  from afex_pos_authority.actor_sessions s
  where s.token_hash = p_token_hash
    and s.authenticated_session_id = p_authenticated_session_id
    and s.authenticated_subject_id = p_authenticated_subject_id;
  if not found then
    raise exception using errcode = '28000', message = 'POS_SESSION_INVALID';
  end if;
  if v_session.revoked_at is not null then
    raise exception using errcode = '28000', message = 'POS_SESSION_REVOKED';
  end if;

  select p.* into v_profile
  from public.profiles p
  where p.id = v_session.authenticated_subject_id
  for share of p;
  if not found then
    v_reason := 'SUBJECT_DELETED';
  elsif not v_profile.is_active then
    v_reason := 'SUBJECT_DISABLED';
  elsif v_profile.tenant_id is distinct from v_session.tenant_id then
    v_reason := 'SUBJECT_TENANT_CHANGED';
  elsif v_profile.role not in ('owner', 'admin', 'manager', 'employee', 'cashier') then
    v_reason := 'SUBJECT_ROLE_CHANGED';
  elsif v_session.expires_at <= v_now then
    v_reason := 'EXPIRED';
  end if;

  if v_reason is null then
    select pp.* into v_actor from public.pos_profiles pp
    where pp.id = v_session.actor_id for share;
    if not found then
      v_reason := 'ACTOR_DELETED';
    elsif not v_actor.is_active then
      v_reason := 'ACTOR_DISABLED';
    elsif v_actor.tenant_id <> v_session.tenant_id then
      v_reason := 'TENANT_CHANGED';
    elsif v_actor.branch_id is distinct from v_session.branch_id then
      v_reason := 'BRANCH_CHANGED';
    elsif v_actor.role <> v_session.actor_role then
      v_reason := 'ROLE_CHANGED';
    elsif 'afex-pos-pin-v1:' || encode(
      extensions.digest(
        convert_to('afex-pos-pin-v1:' || v_actor.pos_pin_hash, 'UTF8'), 'sha256'
      ), 'hex'
    ) <> v_session.credential_fingerprint then
      v_reason := 'PIN_CHANGED';
    elsif v_actor.updated_at <> v_session.actor_version then
      v_reason := 'SECURITY_RESET';
    end if;
  end if;

  if v_reason is null then
    select b.* into v_branch from public.branches b
    where b.id = v_session.branch_id for share;
    if not found or not v_branch.is_active or
       v_branch.tenant_id is distinct from v_session.tenant_id then
      v_reason := 'BRANCH_CHANGED';
    end if;
  end if;

  if v_reason is not null then
    update afex_pos_authority.actor_sessions s
    set revoked_at = v_now, revocation_reason = v_reason
    where s.session_id = v_session.session_id and s.revoked_at is null;
    return;
  end if;

  perform 1 from afex_pos_authority.actor_sessions s
  where s.session_id = v_session.session_id and s.revoked_at is null
  for share;
  if not found then return; end if;

  return query select v_session.session_id, v_session.actor_id,
    v_session.tenant_id, v_session.branch_id, v_session.actor_role,
    v_session.expires_at;
end
$function$;

create function public.pos_actor_session_state_v1(
  p_authenticated_session_id uuid,
  p_authenticated_subject_id uuid
)
returns table (
  authority_state text,
  restriction_required boolean,
  active_session_count bigint,
  expired_session_count bigint,
  revoked_session_count bigint
)
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_now timestamptz := clock_timestamp();
  v_active bigint;
  v_expired bigint;
  v_revoked bigint;
  v_restriction_tombstone boolean;
begin
  if p_authenticated_session_id is null or p_authenticated_subject_id is null then
    raise exception using errcode = '28000', message = 'AUTH_CONTEXT_INVALID';
  end if;
  select
    count(*) filter (where s.revoked_at is null and s.expires_at > v_now),
    count(*) filter (where s.revoked_at is null and s.expires_at <= v_now),
    count(*) filter (where s.revoked_at is not null)
  into v_active, v_expired, v_revoked
  from afex_pos_authority.actor_sessions s
  where s.authenticated_subject_id = p_authenticated_subject_id
    and s.authenticated_session_id = p_authenticated_session_id;
  select exists (
    select 1 from afex_pos_authority.auth_session_locks l
    where l.authenticated_subject_id = p_authenticated_subject_id
      and l.authenticated_session_id = p_authenticated_session_id
      and l.authority_issued_at is not null
  ) into v_restriction_tombstone;
  restriction_required := v_restriction_tombstone;
  active_session_count := v_active;
  expired_session_count := v_expired;
  revoked_session_count := v_revoked;
  authority_state := case
    when v_active > 0 then 'ACTIVE_RESTRICTION'
    when v_expired > 0 then 'EXPIRED_REAUTH_REQUIRED'
    when v_revoked > 0 then 'REVOKED'
    when v_restriction_tombstone then 'REVOKED'
    else 'NO_RESTRICTION'
  end;
  return next;
end
$function$;

create function public.revoke_pos_actor_session_v1(
  p_token_hash text,
  p_authenticated_session_id uuid,
  p_authenticated_subject_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare v_count bigint;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'POS_SESSION_INPUT_INVALID';
  end if;
  if p_reason not in ('LOGOUT', 'LOCKED', 'AUTH_LOGOUT', 'ADMIN_REAUTH', 'SECURITY_RESET') then
    raise exception using errcode = '22023', message = 'POS_SESSION_REASON_INVALID';
  end if;
  if p_authenticated_session_id is null or p_authenticated_subject_id is null then
    raise exception using errcode = '28000', message = 'AUTH_CONTEXT_INVALID';
  end if;
  update afex_pos_authority.actor_sessions s
  set revoked_at = clock_timestamp(), revocation_reason = p_reason
  where s.token_hash = p_token_hash
    and s.authenticated_session_id = p_authenticated_session_id
    and s.authenticated_subject_id = p_authenticated_subject_id
    and s.revoked_at is null;
  get diagnostics v_count = row_count;
  return v_count = 1;
end
$function$;

create function public.revoke_pos_actor_sessions_for_actor_v1(
  p_administrator_subject_id uuid,
  p_administrator_session_id uuid,
  p_actor_id uuid,
  p_reason text
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_count bigint;
  v_admin public.profiles%rowtype;
  v_target public.pos_profiles%rowtype;
begin
  if p_reason not in (
    'LOCKED', 'ACTOR_DISABLED', 'ACTOR_DELETED', 'PIN_CHANGED', 'ROLE_CHANGED',
    'BRANCH_CHANGED', 'TENANT_CHANGED', 'SUPERSEDED', 'SECURITY_RESET'
  ) then
    raise exception using errcode = '22023', message = 'POS_SESSION_REASON_INVALID';
  end if;
  select p.* into v_admin
  from public.profiles p
  where p.id = p_administrator_subject_id
    and p_administrator_session_id is not null
    and p.is_active = true
    and p.role in ('admin', 'manager')
  for share of p;
  if not found then
    raise exception using errcode = '42501', message = 'POS_SESSION_ADMIN_UNAUTHORIZED';
  end if;

  select pp.* into v_target from public.pos_profiles pp
  where pp.id = p_actor_id for share;
  if not found or v_target.tenant_id is distinct from v_admin.tenant_id or
     (v_admin.role = 'manager' and
      v_target.branch_id is distinct from v_admin.branch_id) then
    raise exception using errcode = '42501', message = 'POS_SESSION_ADMIN_SCOPE_DENIED';
  end if;
  update afex_pos_authority.actor_sessions s
  set revoked_at = clock_timestamp(), revocation_reason = p_reason
  where s.actor_id = p_actor_id and s.revoked_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end
$function$;

create function public.cleanup_pos_actor_sessions_v1(p_batch_size integer default 500)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_session_count bigint;
  v_lock_count bigint;
begin
  if p_batch_size < 1 or p_batch_size > 1000 then
    raise exception using errcode = '22023', message = 'POS_SESSION_CLEANUP_BATCH_INVALID';
  end if;
  with candidates as (
    select s.session_id from afex_pos_authority.actor_sessions s
    where coalesce(s.revoked_at, s.expires_at) < clock_timestamp() - interval '90 days'
    order by coalesce(s.revoked_at, s.expires_at), s.session_id
    limit p_batch_size
    for update skip locked
  )
  delete from afex_pos_authority.actor_sessions s
  using candidates c where s.session_id = c.session_id;
  get diagnostics v_session_count = row_count;

  with lock_candidates as (
    select l.authenticated_subject_id, l.authenticated_session_id
    from afex_pos_authority.auth_session_locks l
    where l.created_at < clock_timestamp() - interval '90 days'
      and l.authority_issued_at is null
      and not exists (
        select 1 from afex_pos_authority.actor_sessions s
        where s.authenticated_subject_id = l.authenticated_subject_id
          and s.authenticated_session_id = l.authenticated_session_id
      )
    order by l.created_at, l.authenticated_subject_id, l.authenticated_session_id
    limit p_batch_size
    for update of l skip locked
  )
  delete from afex_pos_authority.auth_session_locks l
  using lock_candidates c
  where l.authenticated_subject_id = c.authenticated_subject_id
    and l.authenticated_session_id = c.authenticated_session_id;
  get diagnostics v_lock_count = row_count;
  return v_session_count + v_lock_count;
end
$function$;

do $ownership$
declare
  v_signature regprocedure;
begin
  foreach v_signature in array array[
    'public.issue_pos_actor_session_v1(text,uuid,uuid,text,uuid)'::regprocedure,
    'public.validate_pos_actor_session_v1(text,uuid,uuid)'::regprocedure,
    'public.pos_actor_session_state_v1(uuid,uuid)'::regprocedure,
    'public.revoke_pos_actor_session_v1(text,uuid,uuid,text)'::regprocedure,
    'public.revoke_pos_actor_sessions_for_actor_v1(uuid,uuid,uuid,text)'::regprocedure,
    'public.cleanup_pos_actor_sessions_v1(integer)'::regprocedure
  ] loop
    execute format('alter function %s owner to afex_pos_session_owner', v_signature);
  end loop;
end
$ownership$;

set local role afex_pos_session_owner;

revoke all on function
  public.issue_pos_actor_session_v1(text,uuid,uuid,text,uuid),
  public.validate_pos_actor_session_v1(text,uuid,uuid),
  public.pos_actor_session_state_v1(uuid,uuid),
  public.revoke_pos_actor_session_v1(text,uuid,uuid,text),
  public.revoke_pos_actor_sessions_for_actor_v1(uuid,uuid,uuid,text),
  public.cleanup_pos_actor_sessions_v1(integer)
from public, anon, authenticated, service_role;

grant execute on function
  public.issue_pos_actor_session_v1(text,uuid,uuid,text,uuid),
  public.validate_pos_actor_session_v1(text,uuid,uuid),
  public.pos_actor_session_state_v1(uuid,uuid),
  public.revoke_pos_actor_session_v1(text,uuid,uuid,text),
  public.revoke_pos_actor_sessions_for_actor_v1(uuid,uuid,uuid,text)
to service_role;

grant execute on function public.cleanup_pos_actor_sessions_v1(integer)
to afex_pos_session_maintenance;

comment on schema afex_pos_authority is
  'Private POS actor-session authority. Application roles have no schema usage.';
comment on table afex_pos_authority.actor_sessions is
  'Opaque-token hashes and bounded authority state retained for 90 days after revocation or expiry.';
comment on table afex_pos_authority.auth_session_locks is
  'One bounded row per verified Auth subject/session pair. authority_issued_at is a permanent restriction tombstone and is never removed by elapsed-time cleanup.';

set local role postgres;

revoke create on schema public from afex_pos_session_owner;
grant usage on schema public to afex_pos_session_maintenance;
revoke create on schema public from afex_pos_session_maintenance;

grant usage on schema public, extensions to afex_pos_session_owner;
grant select, update on table public.profiles, public.pos_profiles,
  public.branches to afex_pos_session_owner;
grant select on table public.tenants to afex_pos_session_owner;
grant execute on function public.verify_pos_pin_for_actor(text,uuid,uuid)
  to afex_pos_session_owner;
grant execute on function extensions.digest(bytea,text) to afex_pos_session_owner;

do $remove_temporary_owner_edges$
declare
  v_role text;
  v_creator_grantor name;
begin
  for v_role in select unnest(array['afex_pos_session_owner','afex_pos_session_maintenance']) loop
    select g.rolname into strict v_creator_grantor
    from pg_catalog.pg_auth_members m
    join pg_catalog.pg_roles r on r.oid=m.roleid
    join pg_catalog.pg_roles member_role on member_role.oid=m.member
    join pg_catalog.pg_roles g on g.oid=m.grantor
    where r.rolname=v_role and member_role.rolname=current_user
      and m.admin_option and not m.inherit_option;

    if v_creator_grantor = current_user then
      execute format(
        'grant %I to %I with admin true, inherit false, set false granted by %I',
        v_role, current_user, current_user
      );
    else
      execute format(
        'revoke %I from %I granted by %I',
        v_role, current_user, current_user
      );
    end if;
  end loop;
end
$remove_temporary_owner_edges$;

do $assertions$
declare
  v_role text;
  v_signature regprocedure;
  v_owner oid := (select oid from pg_catalog.pg_roles where rolname = 'afex_pos_session_owner');
  v_installer oid := (select oid from pg_catalog.pg_roles where rolname = current_user);
  v_expected_creator_edges integer;
  v_creator_edges integer;
  v_creator_grantors integer;
begin
  if exists (
    select 1 from pg_catalog.pg_roles
    where rolname like 'afex_pos_session_%'
      and rolname not in ('afex_pos_session_owner','afex_pos_session_maintenance')
  ) then
    raise exception 'POS_SESSION_UNEXPECTED_OWNER_ROLE';
  end if;
  if exists (
    select 1 from pg_catalog.pg_roles where rolname in (
      'afex_pos_session_owner','afex_pos_session_maintenance'
    ) and (rolcanlogin or rolinherit or rolsuper or rolcreatedb or rolcreaterole or rolreplication)
  ) then
    raise exception 'POS_SESSION_CAPABILITY_ROLE_PROPERTIES_INVALID';
  end if;
  if has_schema_privilege('afex_pos_session_owner','public','CREATE') or
     has_schema_privilege('afex_pos_session_maintenance','public','CREATE') or
     has_database_privilege('afex_pos_session_owner',current_database(),'CREATE') or
     has_database_privilege('afex_pos_session_maintenance',current_database(),'CREATE') then
    raise exception 'POS_SESSION_CAPABILITY_CREATE_EXPOSED';
  end if;
  v_expected_creator_edges := 2;

  select count(*), count(distinct m.grantor)
  into v_creator_edges, v_creator_grantors
  from pg_catalog.pg_auth_members m
  join pg_catalog.pg_roles r on r.oid = m.roleid
  where r.rolname in ('afex_pos_session_owner','afex_pos_session_maintenance')
    and m.member = v_installer
    and m.grantor <> v_installer
    and m.admin_option
    and not m.inherit_option
    and not m.set_option;

  if v_creator_edges <> v_expected_creator_edges or
     v_creator_grantors <> 1 or
     (select min(m.grantor) from pg_catalog.pg_auth_members m
      join pg_catalog.pg_roles r on r.oid=m.roleid
      where r.rolname in ('afex_pos_session_owner','afex_pos_session_maintenance')
        and m.member=v_installer and m.admin_option
        and not m.inherit_option and not m.set_option) <>
     (select min(m.grantor) from pg_catalog.pg_auth_members m
      join pg_catalog.pg_roles r on r.oid=m.roleid
      where r.rolname in (
        'afex_context_issuer','afex_core_owner','afex_core_runtime',
        'afex_function_owner','afex_outbox_worker'
      ) and m.member=v_installer and m.admin_option
        and not m.inherit_option and not m.set_option) or
     exists (
       select 1 from pg_catalog.pg_auth_members m
       join pg_catalog.pg_roles r on r.oid = m.roleid
       where r.rolname in ('afex_pos_session_owner','afex_pos_session_maintenance')
         and not (
           m.member = v_installer and
           m.grantor <> v_installer and
           m.admin_option and
           not m.inherit_option and
           not m.set_option
         )
     ) then
    raise exception 'POS_SESSION_CREATOR_MEMBERSHIP_CONTRACT_INVALID';
  end if;
  if (select nspowner from pg_catalog.pg_namespace where nspname='afex_pos_authority') <> v_owner or
     exists (
       select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
       where n.nspname='afex_pos_authority' and c.relkind in ('r','p') and c.relowner <> v_owner
     ) then
    raise exception 'POS_SESSION_OBJECT_OWNER_INVALID';
  end if;
  foreach v_role in array array['anon','authenticated','service_role'] loop
    if has_schema_privilege(v_role, 'afex_pos_authority', 'USAGE') or
       has_table_privilege(v_role, (select c.oid from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='afex_pos_authority' and c.relname='actor_sessions'), 'SELECT') or
       has_table_privilege(v_role, (select c.oid from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='afex_pos_authority' and c.relname='actor_sessions'), 'INSERT') or
       has_table_privilege(v_role, (select c.oid from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='afex_pos_authority' and c.relname='actor_sessions'), 'UPDATE') or
       has_table_privilege(v_role, (select c.oid from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='afex_pos_authority' and c.relname='actor_sessions'), 'DELETE') then
      raise exception 'POS_SESSION_DIRECT_ACCESS_EXPOSED:%', v_role;
    end if;
  end loop;
  if (select count(*) from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where ((n.nspname='public' and p.proname in (
        'issue_pos_actor_session_v1','validate_pos_actor_session_v1',
        'pos_actor_session_state_v1','revoke_pos_actor_session_v1',
        'revoke_pos_actor_sessions_for_actor_v1','cleanup_pos_actor_sessions_v1'
      )) or (n.nspname='afex_pos_authority' and p.proname='enforce_actor_session_transition'))
        and p.proowner=v_owner and p.prosecdef
        and p.proconfig=array['search_path=pg_catalog']) <> 7 then
    raise exception 'POS_SESSION_FUNCTION_IDENTITY_INVALID';
  end if;
  foreach v_signature in array array[
    'public.issue_pos_actor_session_v1(text,uuid,uuid,text,uuid)'::regprocedure,
    'public.validate_pos_actor_session_v1(text,uuid,uuid)'::regprocedure,
    'public.pos_actor_session_state_v1(uuid,uuid)'::regprocedure,
    'public.revoke_pos_actor_session_v1(text,uuid,uuid,text)'::regprocedure,
    'public.revoke_pos_actor_sessions_for_actor_v1(uuid,uuid,uuid,text)'::regprocedure
  ] loop
    if not has_function_privilege('service_role',v_signature,'EXECUTE') or
       has_function_privilege('anon',v_signature,'EXECUTE') or
       has_function_privilege('authenticated',v_signature,'EXECUTE') then
      raise exception 'POS_SESSION_FUNCTION_ACL_INVALID:%',v_signature;
    end if;
  end loop;
  if has_function_privilege('service_role','public.cleanup_pos_actor_sessions_v1(integer)','EXECUTE') or
     not has_function_privilege('afex_pos_session_maintenance','public.cleanup_pos_actor_sessions_v1(integer)','EXECUTE') then
    raise exception 'POS_SESSION_CLEANUP_ACL_INVALID';
  end if;
  if exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl,acldefault('f'::"char",p.proowner))) a
    where ((n.nspname='public' and p.proname like '%pos_actor_session%') or
           (n.nspname='afex_pos_authority' and p.proname='enforce_actor_session_transition'))
      and a.grantee=0 and a.privilege_type='EXECUTE'
  ) then
    raise exception 'POS_SESSION_PUBLIC_EXECUTE_EXPOSED';
  end if;
  if not (select c.relrowsecurity and c.relforcerowsecurity from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
          where n.nspname='afex_pos_authority' and c.relname='actor_sessions') or
     not (select c.relrowsecurity and c.relforcerowsecurity from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
          where n.nspname='afex_pos_authority' and c.relname='auth_session_locks') or
     (select count(*) from pg_catalog.pg_policy p where p.polrelid in (
       select c.oid from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
       where n.nspname='afex_pos_authority' and c.relname in ('actor_sessions','auth_session_locks')
      )) <> 2 or
     (select count(*) from pg_catalog.pg_trigger t
       where t.tgrelid=(select c.oid from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='afex_pos_authority' and c.relname='actor_sessions') and not t.tgisinternal) <> 1 then
    raise exception 'POS_SESSION_RLS_POLICY_TRIGGER_INVENTORY_INVALID';
  end if;
  if (select count(*) from pg_catalog.pg_constraint c
       where c.conrelid=(select x.oid from pg_catalog.pg_class x join pg_catalog.pg_namespace n on n.oid=x.relnamespace where n.nspname='afex_pos_authority' and x.relname='actor_sessions')) <> 10 or
      (select count(*) from pg_catalog.pg_constraint c
       where c.conrelid=(select x.oid from pg_catalog.pg_class x join pg_catalog.pg_namespace n on n.oid=x.relnamespace where n.nspname='afex_pos_authority' and x.relname='auth_session_locks')) <> 2 then
    raise exception 'POS_SESSION_CONSTRAINT_INVENTORY_INVALID';
  end if;
  if (select count(*) from pg_catalog.pg_indexes i
      where i.schemaname='afex_pos_authority' and i.indexname in (
        'actor_sessions_subject_active_idx','actor_sessions_actor_active_idx',
        'actor_sessions_expiry_idx','actor_sessions_revoked_retention_idx',
        'actor_sessions_auth_session_active_uidx'
      )) <> 5 then
    raise exception 'POS_SESSION_INDEX_INVENTORY_INVALID';
  end if;
end
$assertions$;

commit;
