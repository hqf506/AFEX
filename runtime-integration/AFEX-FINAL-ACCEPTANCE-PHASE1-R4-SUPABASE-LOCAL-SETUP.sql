begin;

create role afex_context_issuer nologin noinherit;
create role afex_core_owner nologin noinherit;
create role afex_core_runtime nologin noinherit;
create role afex_function_owner nologin noinherit;
create role afex_outbox_worker nologin noinherit;

create table public.tenants (id uuid primary key);
create table public.branches (
  id uuid primary key,
  tenant_id uuid,
  is_active boolean not null default true
);
create table public.profiles (
  id uuid primary key,
  tenant_id uuid,
  branch_id uuid,
  role text not null,
  is_active boolean not null default true,
  updated_at timestamptz not null default clock_timestamp()
);
create table public.pos_profiles (
  id uuid primary key,
  tenant_id uuid not null,
  branch_id uuid,
  username text not null,
  full_name text not null,
  role text not null,
  is_active boolean not null default true,
  updated_at timestamptz not null default clock_timestamp(),
  pos_pin_hash text
);

create function public.verify_pos_pin_for_actor(
  p_raw_pin text,
  p_actor_user_id uuid,
  p_requested_branch_id uuid default null
)
returns table (id uuid, username text, full_name text, role text, branch_id uuid)
language sql security definer set search_path=pg_catalog
as $function$
  select pp.id,pp.username,pp.full_name,pp.role,pp.branch_id
  from public.profiles p join public.pos_profiles pp on pp.tenant_id=p.tenant_id
  where p.id=p_actor_user_id and p.is_active=true and pp.is_active=true
    and (p_requested_branch_id is null or pp.branch_id=p_requested_branch_id)
    and extensions.crypt(p_raw_pin,pp.pos_pin_hash)=pp.pos_pin_hash
$function$;
revoke all on function public.verify_pos_pin_for_actor(text,uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.verify_pos_pin_for_actor(text,uuid,uuid)
  to service_role;

insert into public.tenants values
 ('10000000-0000-0000-0000-000000000001'),
 ('10000000-0000-0000-0000-000000000002');
insert into public.branches values
 ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',true),
 ('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002',true);
insert into public.profiles values
 ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','admin',true,clock_timestamp()),
 ('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','admin',true,clock_timestamp());
insert into public.pos_profiles values
 ('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','cashier-a','Cashier A','cashier',true,clock_timestamp(),extensions.crypt('2468',extensions.gen_salt('bf'))),
 ('50000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','cashier-b','Cashier B','cashier',true,clock_timestamp(),extensions.crypt('1357',extensions.gen_salt('bf')));

commit;
