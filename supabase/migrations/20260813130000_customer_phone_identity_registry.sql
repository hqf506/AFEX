begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local check_function_bodies = on;

grant afex_function_owner to postgres
  with admin false, inherit false, set true
  granted by postgres;

grant usage, create on schema public to afex_function_owner;
grant usage on schema auth to afex_function_owner;
grant execute on function auth.role() to afex_function_owner;
grant execute on function public.current_profile_tenant_id() to afex_function_owner;

create or replace function public.normalize_saudi_customer_phone_v1(p_value text)
returns text
language plpgsql
immutable
strict
set search_path = pg_catalog
as $function$
declare
  v_digits text;
begin
  v_digits := regexp_replace(
    translate(btrim(p_value), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'),
    '[^0-9]',
    '',
    'g'
  );

  if v_digits ~ '^05[0-9]{8}$' then
    return '966' || substr(v_digits, 2);
  elsif v_digits ~ '^5[0-9]{8}$' then
    return '966' || v_digits;
  elsif v_digits ~ '^9665[0-9]{8}$' then
    return v_digits;
  end if;

  return null;
end
$function$;

alter function public.normalize_saudi_customer_phone_v1(text) owner to afex_function_owner;
revoke all on function public.normalize_saudi_customer_phone_v1(text) from public;
grant execute on function public.normalize_saudi_customer_phone_v1(text) to authenticated, service_role, afex_core_runtime;

alter table public.customers
  add column if not exists normalized_phone text,
  add column if not exists display_phone text,
  add column if not exists phone_identity_state text;

alter table public.customers
  drop constraint if exists customers_phone_identity_state_check;

alter table public.customers
  add constraint customers_phone_identity_state_check
  check (phone_identity_state in ('RESOLVED', 'AMBIGUOUS_LEGACY_COLLISION', 'INVALID_QUARANTINED'));

create table if not exists public.customer_phone_identities (
  tenant_id uuid not null references public.tenants(id) on update restrict on delete restrict,
  normalized_phone text not null,
  resolution_status text not null check (resolution_status in ('RESOLVED', 'AMBIGUOUS')),
  canonical_customer_id uuid null references public.customers(id) on update restrict on delete restrict,
  member_count integer not null check (member_count > 0),
  created_at timestamptz not null default transaction_timestamp(),
  updated_at timestamptz not null default transaction_timestamp(),
  primary key (tenant_id, normalized_phone),
  constraint customer_phone_identities_resolution_check check (
    (resolution_status = 'RESOLVED' and member_count = 1 and canonical_customer_id is not null)
    or
    (resolution_status = 'AMBIGUOUS' and member_count > 1 and canonical_customer_id is null)
  )
);

create table if not exists public.customer_phone_identity_members (
  tenant_id uuid not null,
  normalized_phone text not null,
  customer_id uuid not null references public.customers(id) on update restrict on delete restrict,
  created_at timestamptz not null default transaction_timestamp(),
  primary key (tenant_id, normalized_phone, customer_id),
  foreign key (tenant_id, normalized_phone)
    references public.customer_phone_identities(tenant_id, normalized_phone)
    on update restrict on delete restrict
    deferrable initially deferred
);

alter table public.customer_phone_identities enable row level security;
alter table public.customer_phone_identities force row level security;
alter table public.customer_phone_identity_members enable row level security;
alter table public.customer_phone_identity_members force row level security;

revoke all on table public.customer_phone_identities, public.customer_phone_identity_members
  from public, anon, authenticated, service_role, afex_core_runtime;
grant select, insert, update on table public.customer_phone_identities to afex_function_owner;
grant select, insert, delete on table public.customer_phone_identity_members to afex_function_owner;
grant select, insert, update on table public.customers to afex_function_owner;
grant select on table public.branches, public.tenants to afex_function_owner;

create policy customer_phone_identities_function_owner
  on public.customer_phone_identities for all to afex_function_owner
  using (true) with check (true);
create policy customer_phone_identity_members_function_owner
  on public.customer_phone_identity_members for all to afex_function_owner
  using (true) with check (true);

create policy p2d22_phone_function_owner_customers_select
  on public.customers for select to afex_function_owner using (true);
create policy p2d22_phone_function_owner_customers_insert
  on public.customers for insert to afex_function_owner with check (true);
create policy p2d22_phone_function_owner_customers_update
  on public.customers for update to afex_function_owner using (true) with check (true);
create policy p2d22_phone_function_owner_branches_select
  on public.branches for select to afex_function_owner using (true);
create policy p2d22_phone_function_owner_tenants_select
  on public.tenants for select to afex_function_owner using (true);

create or replace function public.refresh_customer_phone_identity_v1(
  p_tenant_id uuid,
  p_normalized_phone text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_count integer;
  v_customer_id uuid;
begin
  if p_tenant_id is null or p_normalized_phone is null then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || p_normalized_phone, 0));

  select count(*)::integer, (array_agg(id order by id))[1]
    into v_count, v_customer_id
  from public.customers
  where tenant_id = p_tenant_id
    and normalized_phone = p_normalized_phone;

  if v_count = 0 then
    delete from public.customer_phone_identity_members
    where tenant_id = p_tenant_id and normalized_phone = p_normalized_phone;
    delete from public.customer_phone_identities
    where tenant_id = p_tenant_id and normalized_phone = p_normalized_phone;
    return;
  end if;

  insert into public.customer_phone_identities (
    tenant_id, normalized_phone, resolution_status, canonical_customer_id, member_count
  ) values (
    p_tenant_id,
    p_normalized_phone,
    case when v_count = 1 then 'RESOLVED' else 'AMBIGUOUS' end,
    case when v_count = 1 then v_customer_id else null end,
    v_count
  )
  on conflict (tenant_id, normalized_phone) do update set
    resolution_status = excluded.resolution_status,
    canonical_customer_id = excluded.canonical_customer_id,
    member_count = excluded.member_count,
    updated_at = transaction_timestamp();

  delete from public.customer_phone_identity_members
  where tenant_id = p_tenant_id and normalized_phone = p_normalized_phone;

  insert into public.customer_phone_identity_members (tenant_id, normalized_phone, customer_id)
  select tenant_id, normalized_phone, id
  from public.customers
  where tenant_id = p_tenant_id and normalized_phone = p_normalized_phone
  order by id;

  update public.customers
  set phone_identity_state = case
    when v_count = 1 then 'RESOLVED'
    else 'AMBIGUOUS_LEGACY_COLLISION'
  end
  where tenant_id = p_tenant_id and normalized_phone = p_normalized_phone
    and phone_identity_state is distinct from case
      when v_count = 1 then 'RESOLVED'
      else 'AMBIGUOUS_LEGACY_COLLISION'
    end;
end
$function$;

alter function public.refresh_customer_phone_identity_v1(uuid, text) owner to afex_function_owner;
revoke all on function public.refresh_customer_phone_identity_v1(uuid, text) from public, anon, authenticated, service_role, afex_core_runtime;

create or replace function public.prepare_customer_phone_identity_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  new.display_phone := coalesce(nullif(btrim(new.display_phone), ''), nullif(btrim(new.phone), ''));
  new.normalized_phone := public.normalize_saudi_customer_phone_v1(coalesce(new.display_phone, new.phone));
  new.phone_identity_state := case
    when new.normalized_phone is null then 'INVALID_QUARANTINED'
    else coalesce(new.phone_identity_state, 'RESOLVED')
  end;
  return new;
end
$function$;

alter function public.prepare_customer_phone_identity_v1() owner to afex_function_owner;
revoke all on function public.prepare_customer_phone_identity_v1() from public, anon, authenticated, service_role, afex_core_runtime;

create or replace function public.sync_customer_phone_identity_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
begin
  if tg_op <> 'INSERT' and old.tenant_id is not null and old.normalized_phone is not null then
    perform public.refresh_customer_phone_identity_v1(old.tenant_id, old.normalized_phone);
  end if;
  if tg_op <> 'DELETE' and new.tenant_id is not null and new.normalized_phone is not null then
    perform public.refresh_customer_phone_identity_v1(new.tenant_id, new.normalized_phone);
  end if;
  return null;
end
$function$;

alter function public.sync_customer_phone_identity_v1() owner to afex_function_owner;
revoke all on function public.sync_customer_phone_identity_v1() from public, anon, authenticated, service_role, afex_core_runtime;

drop trigger if exists prepare_customer_phone_identity_v1 on public.customers;
create trigger prepare_customer_phone_identity_v1
before insert or update of phone, display_phone, tenant_id on public.customers
for each row execute function public.prepare_customer_phone_identity_v1();

drop trigger if exists sync_customer_phone_identity_v1 on public.customers;
create constraint trigger sync_customer_phone_identity_v1
after insert or delete or update of normalized_phone, tenant_id on public.customers
deferrable initially deferred
for each row execute function public.sync_customer_phone_identity_v1();

update public.customers
set display_phone = coalesce(nullif(btrim(display_phone), ''), nullif(btrim(phone), '')),
    normalized_phone = public.normalize_saudi_customer_phone_v1(coalesce(display_phone, phone)),
    phone_identity_state = case
      when public.normalize_saudi_customer_phone_v1(coalesce(display_phone, phone)) is null
        then 'INVALID_QUARANTINED'
      else 'RESOLVED'
    end;

insert into public.customer_phone_identities (
  tenant_id, normalized_phone, resolution_status, canonical_customer_id, member_count
)
select
  tenant_id,
  normalized_phone,
  case when count(*) = 1 then 'RESOLVED' else 'AMBIGUOUS' end,
  case when count(*) = 1 then (array_agg(id order by id))[1] else null end,
  count(*)::integer
from public.customers
where tenant_id is not null and normalized_phone is not null
group by tenant_id, normalized_phone
on conflict (tenant_id, normalized_phone) do update set
  resolution_status = excluded.resolution_status,
  canonical_customer_id = excluded.canonical_customer_id,
  member_count = excluded.member_count,
  updated_at = transaction_timestamp();

insert into public.customer_phone_identity_members (tenant_id, normalized_phone, customer_id)
select tenant_id, normalized_phone, id
from public.customers
where tenant_id is not null and normalized_phone is not null
on conflict do nothing;

update public.customers c
set phone_identity_state = case
  when i.resolution_status = 'RESOLVED' then 'RESOLVED'
  else 'AMBIGUOUS_LEGACY_COLLISION'
end
from public.customer_phone_identities i
where i.tenant_id = c.tenant_id and i.normalized_phone = c.normalized_phone;

set constraints all immediate;

create index if not exists customers_tenant_normalized_phone_idx
  on public.customers (tenant_id, normalized_phone, id)
  where normalized_phone is not null;

create or replace function public.lookup_customer_phone_identity_v1(
  p_tenant_id uuid,
  p_normalized_phone text,
  p_branch_id uuid default null
)
returns table (
  customer_id uuid,
  customer_name text,
  display_phone text,
  resolution_status text,
  record_version bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $function$
begin
  if p_tenant_id is null or p_normalized_phone is null
     or p_normalized_phone <> public.normalize_saudi_customer_phone_v1(p_normalized_phone) then
    raise exception using errcode='22023', message='CUSTOMER_UPDATE_INVALID';
  end if;
  if session_user <> 'postgres'
     and coalesce(auth.role(), '') <> 'service_role'
     and p_tenant_id is distinct from public.current_profile_tenant_id() then
    raise exception using errcode='42501', message='CUSTOMER_SCOPE_CONFLICT';
  end if;

  return query
  select c.id, c.name, coalesce(c.display_phone, c.phone), i.resolution_status, c.xmin::text::bigint
  from public.customer_phone_identities i
  join public.customer_phone_identity_members m
    on m.tenant_id=i.tenant_id and m.normalized_phone=i.normalized_phone
  join public.customers c on c.id=m.customer_id and c.tenant_id=i.tenant_id
  where i.tenant_id=p_tenant_id and i.normalized_phone=p_normalized_phone
    and (p_branch_id is null or c.branch_id=p_branch_id)
  order by c.name, c.id;
end
$function$;

alter function public.lookup_customer_phone_identity_v1(uuid, text, uuid) owner to afex_function_owner;
revoke all on function public.lookup_customer_phone_identity_v1(uuid, text, uuid) from public, anon;
grant execute on function public.lookup_customer_phone_identity_v1(uuid, text, uuid) to authenticated, service_role, afex_core_runtime;

create or replace function public.create_customer_with_phone_identity_v1(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_name text,
  p_display_phone text,
  p_email text default null,
  p_notes text default null
)
returns table (id uuid, name text, phone text)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_normalized_phone text;
  v_customer public.customers%rowtype;
begin
  v_normalized_phone := public.normalize_saudi_customer_phone_v1(p_display_phone);
  if p_tenant_id is null or nullif(btrim(p_name),'') is null or v_normalized_phone is null then
    raise exception using errcode='22023', message='CUSTOMER_UPDATE_INVALID';
  end if;
  if session_user <> 'postgres'
     and coalesce(auth.role(), '') <> 'service_role'
     and p_tenant_id is distinct from public.current_profile_tenant_id() then
    raise exception using errcode='42501', message='CUSTOMER_SCOPE_CONFLICT';
  end if;
  if p_branch_id is not null and not exists (
    select 1 from public.branches b where b.id=p_branch_id and b.tenant_id=p_tenant_id
  ) then
    raise exception using errcode='22023', message='CUSTOMER_UPDATE_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || v_normalized_phone, 0));
  if exists (
    select 1 from public.customer_phone_identities
    where tenant_id=p_tenant_id and normalized_phone=v_normalized_phone
  ) then
    raise exception using errcode='P0001', message='CUSTOMER_SCOPE_CONFLICT';
  end if;

  insert into public.customers (
    tenant_id, branch_id, name, phone, display_phone, normalized_phone,
    phone_identity_state, email, notes
  ) values (
    p_tenant_id, p_branch_id, btrim(p_name), btrim(p_display_phone), btrim(p_display_phone),
    v_normalized_phone, 'RESOLVED', nullif(btrim(p_email),''), nullif(btrim(p_notes),'')
  ) returning * into v_customer;

  perform public.refresh_customer_phone_identity_v1(p_tenant_id, v_normalized_phone);
  return query select v_customer.id, v_customer.name, coalesce(v_customer.display_phone, v_customer.phone);
end
$function$;

alter function public.create_customer_with_phone_identity_v1(uuid, uuid, text, text, text, text) owner to afex_function_owner;
revoke all on function public.create_customer_with_phone_identity_v1(uuid, uuid, text, text, text, text) from public, anon;
grant execute on function public.create_customer_with_phone_identity_v1(uuid, uuid, text, text, text, text) to authenticated, service_role;

do $verify$
declare
  v_ambiguous_groups integer;
  v_ambiguous_customers integer;
begin
  select count(*), coalesce(sum(member_count),0)
  into v_ambiguous_groups, v_ambiguous_customers
  from public.customer_phone_identities where resolution_status='AMBIGUOUS';

  if v_ambiguous_groups <> 2 or v_ambiguous_customers <> 5 then
    raise exception using errcode='55000', message='CUSTOMER_PHONE_COLLISION_BASELINE_CHANGED';
  end if;
  if (select count(*) from public.customers where phone_identity_state='AMBIGUOUS_LEGACY_COLLISION') <> 5 then
    raise exception using errcode='55000', message='CUSTOMER_PHONE_MEMBER_CLASSIFICATION_FAILED';
  end if;
  if exists (
    select 1 from public.customer_phone_identities
    where (resolution_status='RESOLVED' and (member_count<>1 or canonical_customer_id is null))
       or (resolution_status='AMBIGUOUS' and (member_count<=1 or canonical_customer_id is not null))
  ) then
    raise exception using errcode='55000', message='CUSTOMER_PHONE_REGISTRY_INVARIANT_FAILED';
  end if;
end
$verify$;

revoke afex_function_owner from postgres granted by postgres;

commit;
