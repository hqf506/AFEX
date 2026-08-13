begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local check_function_bodies = on;

-- SQLSTATE 42501 closure: the two public phone entry points previously called
-- auth.role() as afex_function_owner. Granting auth schema USAGE would expose
-- additional PUBLIC-executable Auth helpers, so the request-role projection is
-- moved behind an owner-only private helper with no Auth schema dependency.
do $preflight$
declare
  v_signature text;
  v_expected_config text[];
  v_expected_security_definer boolean;
begin
  if not exists (select 1 from pg_roles where rolname = 'afex_function_owner') then
    raise exception using errcode = '55000', message = 'PHONE_AUTH_OWNER_MISSING';
  end if;

  if not exists (
    select 1
    from pg_auth_members m
    join pg_roles granted_role on granted_role.oid=m.roleid
    join pg_roles member_role on member_role.oid=m.member
    join pg_roles grantor_role on grantor_role.oid=m.grantor
    where granted_role.rolname='afex_function_owner'
      and member_role.rolname='postgres'
      and grantor_role.rolname='supabase_admin'
      and m.admin_option
      and not m.inherit_option
      and not m.set_option
  ) then
    raise exception using errcode = '55000', message = 'PHONE_AUTH_INSTALLER_MEMBERSHIP_DRIFT';
  end if;

  for v_signature, v_expected_security_definer, v_expected_config in
    select * from (values
      ('public.normalize_saudi_customer_phone_v1(text)', false, array['search_path=pg_catalog']::text[]),
      ('public.lookup_customer_phone_identity_v1(uuid,text,uuid)', true, array['search_path=pg_catalog, public, auth']::text[]),
      ('public.create_customer_with_phone_identity_v1(uuid,uuid,text,text,text,text)', true, array['search_path=pg_catalog, public, auth']::text[]),
      ('public.refresh_customer_phone_identity_v1(uuid,text)', true, array['search_path=pg_catalog, public']::text[]),
      ('public.prepare_customer_phone_identity_v1()', true, array['search_path=pg_catalog, public']::text[]),
      ('public.sync_customer_phone_identity_v1()', true, array['search_path=pg_catalog, public']::text[])
    ) expected(signature, security_definer, config)
  loop
    if to_regprocedure(v_signature) is null
       or pg_get_userbyid((select proowner from pg_proc where oid = v_signature::regprocedure)) <> 'afex_function_owner'
       or (select prosecdef from pg_proc where oid = v_signature::regprocedure) is distinct from v_expected_security_definer
       or (select proconfig from pg_proc where oid = v_signature::regprocedure) is distinct from v_expected_config then
      raise exception using errcode = '55000', message = 'PHONE_AUTH_FUNCTION_IDENTITY_DRIFT';
    end if;
  end loop;

  if position('auth.role()' in pg_get_functiondef('public.lookup_customer_phone_identity_v1(uuid,text,uuid)'::regprocedure)) = 0
     or position('auth.role()' in pg_get_functiondef('public.create_customer_with_phone_identity_v1(uuid,uuid,text,text,text,text)'::regprocedure)) = 0 then
    raise exception using errcode = '55000', message = 'PHONE_AUTH_EXPECTED_DEPENDENCY_MISSING';
  end if;
end
$preflight$;

-- Temporarily enable only SET OPTION on the pre-existing, ADMIN-governed
-- afex_function_owner -> postgres membership. PostgreSQL records this bounded
-- SET grant under postgres separately from the supabase_admin baseline grant;
-- the temporary grant is revoked by exact grantor before the final assertions.
-- and asserted before commit.
grant afex_function_owner to postgres with set true;

create schema afex_phone_private authorization afex_function_owner;
revoke all on schema afex_phone_private from public, anon, authenticated, service_role, afex_core_runtime;
grant usage on schema afex_phone_private to afex_function_owner;

set local role afex_function_owner;

create function afex_phone_private.request_role_v1()
returns text
language sql
stable
security invoker
set search_path = pg_catalog
as $function$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
  )::text
$function$;

revoke all on function afex_phone_private.request_role_v1()
  from public, anon, authenticated, service_role, afex_core_runtime;

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
set search_path = pg_catalog, public
as $function$
begin
  if p_tenant_id is null or p_normalized_phone is null
     or p_normalized_phone <> public.normalize_saudi_customer_phone_v1(p_normalized_phone) then
    raise exception using errcode='22023', message='CUSTOMER_UPDATE_INVALID';
  end if;
  if session_user <> 'postgres'
     and coalesce(afex_phone_private.request_role_v1(), '') <> 'service_role'
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
set search_path = pg_catalog, public
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
     and coalesce(afex_phone_private.request_role_v1(), '') <> 'service_role'
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

revoke all on function public.lookup_customer_phone_identity_v1(uuid,text,uuid)
  from public, anon;
grant execute on function public.lookup_customer_phone_identity_v1(uuid,text,uuid)
  to authenticated, service_role, afex_core_runtime;
revoke all on function public.create_customer_with_phone_identity_v1(uuid,uuid,text,text,text,text)
  from public, anon, afex_core_runtime;
grant execute on function public.create_customer_with_phone_identity_v1(uuid,uuid,text,text,text,text)
  to authenticated, service_role;

set local role postgres;
revoke afex_function_owner from postgres granted by postgres;

do $verify$
declare
  v_signature text;
  v_role text;
begin
  if has_schema_privilege('afex_function_owner', 'auth', 'USAGE')
     or has_schema_privilege('afex_function_owner', 'auth', 'CREATE')
     or exists (
       select 1 from information_schema.role_table_grants
       where grantee='afex_function_owner' and table_schema='auth'
     ) or exists (
       select 1 from information_schema.role_column_grants
       where grantee='afex_function_owner' and table_schema='auth'
     ) then
    raise exception using errcode = '55000', message = 'PHONE_AUTH_SURFACE_NOT_CLOSED';
  end if;

  if (select count(*)
      from pg_auth_members m
      join pg_roles granted_role on granted_role.oid=m.roleid
      join pg_roles member_role on member_role.oid=m.member
      where member_role.rolname='afex_function_owner' or granted_role.rolname='afex_function_owner') <> 1
     or not exists (
       select 1
       from pg_auth_members m
       join pg_roles granted_role on granted_role.oid=m.roleid
       join pg_roles member_role on member_role.oid=m.member
       join pg_roles grantor_role on grantor_role.oid=m.grantor
       where granted_role.rolname='afex_function_owner'
         and member_role.rolname='postgres'
         and grantor_role.rolname='supabase_admin'
         and m.admin_option
         and not m.inherit_option
         and not m.set_option
     ) then
    raise exception using errcode='55000', message='PHONE_AUTH_MEMBERSHIP_NOT_RESTORED';
  end if;

  if not has_schema_privilege('afex_function_owner','afex_phone_private','USAGE')
     or has_schema_privilege('public','afex_phone_private','USAGE')
     or has_function_privilege('public','afex_phone_private.request_role_v1()','EXECUTE')
     or has_function_privilege('anon','afex_phone_private.request_role_v1()','EXECUTE')
     or has_function_privilege('authenticated','afex_phone_private.request_role_v1()','EXECUTE')
     or has_function_privilege('service_role','afex_phone_private.request_role_v1()','EXECUTE')
     or has_function_privilege('afex_core_runtime','afex_phone_private.request_role_v1()','EXECUTE') then
    raise exception using errcode='55000', message='PHONE_PRIVATE_HELPER_EXPOSED';
  end if;

  if position('auth.' in pg_get_functiondef('public.lookup_customer_phone_identity_v1(uuid,text,uuid)'::regprocedure)) > 0
     or position('auth.' in pg_get_functiondef('public.create_customer_with_phone_identity_v1(uuid,uuid,text,text,text,text)'::regprocedure)) > 0
     or (select proconfig from pg_proc where oid='public.lookup_customer_phone_identity_v1(uuid,text,uuid)'::regprocedure)
        is distinct from array['search_path=pg_catalog, public']::text[]
     or (select proconfig from pg_proc where oid='public.create_customer_with_phone_identity_v1(uuid,uuid,text,text,text,text)'::regprocedure)
        is distinct from array['search_path=pg_catalog, public']::text[] then
    raise exception using errcode='55000', message='PHONE_AUTH_DEPENDENCY_REMAINS';
  end if;

  foreach v_signature in array array[
    'public.normalize_saudi_customer_phone_v1(text)',
    'public.lookup_customer_phone_identity_v1(uuid,text,uuid)',
    'public.create_customer_with_phone_identity_v1(uuid,uuid,text,text,text,text)',
    'public.refresh_customer_phone_identity_v1(uuid,text)',
    'public.prepare_customer_phone_identity_v1()',
    'public.sync_customer_phone_identity_v1()'
  ] loop
    if has_function_privilege('public',v_signature,'EXECUTE') then
      raise exception using errcode='55000', message='PHONE_AUTH_PUBLIC_EXECUTE_PRESENT';
    end if;
  end loop;

  foreach v_role in array array['anon','authenticated','service_role','afex_core_runtime'] loop
    foreach v_signature in array array[
      'public.refresh_customer_phone_identity_v1(uuid,text)',
      'public.prepare_customer_phone_identity_v1()',
      'public.sync_customer_phone_identity_v1()'
    ] loop
      if has_function_privilege(v_role,v_signature,'EXECUTE') then
        raise exception using errcode='55000', message='PHONE_AUTH_INTERNAL_FUNCTION_EXPOSED';
      end if;
    end loop;
  end loop;
end
$verify$;

commit;
