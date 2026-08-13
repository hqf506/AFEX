begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';
set local role postgres;

do $preflight$
declare
  v_function_count integer;
begin
  if not exists (select 1 from pg_roles where rolname = 'afex_function_owner')
     or not exists (select 1 from pg_roles where rolname = 'anon')
     or not exists (select 1 from pg_roles where rolname = 'authenticated')
     or not exists (select 1 from pg_roles where rolname = 'service_role')
     or not exists (select 1 from pg_roles where rolname = 'afex_core_runtime') then
    raise exception using errcode = '55000', message = 'CUSTOMER_PHONE_ACL_REQUIRED_ROLE_MISSING';
  end if;

  select count(*)
  into v_function_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.oid in (
      'public.normalize_saudi_customer_phone_v1(text)'::regprocedure,
      'public.refresh_customer_phone_identity_v1(uuid,text)'::regprocedure,
      'public.prepare_customer_phone_identity_v1()'::regprocedure,
      'public.sync_customer_phone_identity_v1()'::regprocedure,
      'public.lookup_customer_phone_identity_v1(uuid,text,uuid)'::regprocedure,
      'public.create_customer_with_phone_identity_v1(uuid,uuid,text,text,text,text)'::regprocedure
    );

  if v_function_count <> 6 then
    raise exception using errcode = '55000', message = 'CUSTOMER_PHONE_ACL_SIGNATURE_SET_MISMATCH';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'normalize_saudi_customer_phone_v1',
        'refresh_customer_phone_identity_v1',
        'prepare_customer_phone_identity_v1',
        'sync_customer_phone_identity_v1',
        'lookup_customer_phone_identity_v1',
        'create_customer_with_phone_identity_v1'
      )
      and p.oid not in (
        'public.normalize_saudi_customer_phone_v1(text)'::regprocedure,
        'public.refresh_customer_phone_identity_v1(uuid,text)'::regprocedure,
        'public.prepare_customer_phone_identity_v1()'::regprocedure,
        'public.sync_customer_phone_identity_v1()'::regprocedure,
        'public.lookup_customer_phone_identity_v1(uuid,text,uuid)'::regprocedure,
        'public.create_customer_with_phone_identity_v1(uuid,uuid,text,text,text,text)'::regprocedure
      )
  ) then
    raise exception using errcode = '55000', message = 'CUSTOMER_PHONE_ACL_UNEXPECTED_OVERLOAD';
  end if;

  if exists (
    select 1
    from pg_proc p
    where p.oid in (
      'public.normalize_saudi_customer_phone_v1(text)'::regprocedure,
      'public.refresh_customer_phone_identity_v1(uuid,text)'::regprocedure,
      'public.prepare_customer_phone_identity_v1()'::regprocedure,
      'public.sync_customer_phone_identity_v1()'::regprocedure,
      'public.lookup_customer_phone_identity_v1(uuid,text,uuid)'::regprocedure,
      'public.create_customer_with_phone_identity_v1(uuid,uuid,text,text,text,text)'::regprocedure
    )
      and pg_get_userbyid(p.proowner) <> 'afex_function_owner'
  ) then
    raise exception using errcode = '55000', message = 'CUSTOMER_PHONE_ACL_OWNER_DRIFT';
  end if;

  if (select prosecdef from pg_proc where oid = 'public.normalize_saudi_customer_phone_v1(text)'::regprocedure)
     or not (select prosecdef from pg_proc where oid = 'public.refresh_customer_phone_identity_v1(uuid,text)'::regprocedure)
     or not (select prosecdef from pg_proc where oid = 'public.prepare_customer_phone_identity_v1()'::regprocedure)
     or not (select prosecdef from pg_proc where oid = 'public.sync_customer_phone_identity_v1()'::regprocedure)
     or not (select prosecdef from pg_proc where oid = 'public.lookup_customer_phone_identity_v1(uuid,text,uuid)'::regprocedure)
     or not (select prosecdef from pg_proc where oid = 'public.create_customer_with_phone_identity_v1(uuid,uuid,text,text,text,text)'::regprocedure) then
    raise exception using errcode = '55000', message = 'CUSTOMER_PHONE_ACL_SECURITY_DEFINER_DRIFT';
  end if;

  if (select proconfig from pg_proc where oid = 'public.normalize_saudi_customer_phone_v1(text)'::regprocedure)
       is distinct from array['search_path=pg_catalog']::text[]
     or (select proconfig from pg_proc where oid = 'public.refresh_customer_phone_identity_v1(uuid,text)'::regprocedure)
       is distinct from array['search_path=pg_catalog, public']::text[]
     or (select proconfig from pg_proc where oid = 'public.prepare_customer_phone_identity_v1()'::regprocedure)
       is distinct from array['search_path=pg_catalog, public']::text[]
     or (select proconfig from pg_proc where oid = 'public.sync_customer_phone_identity_v1()'::regprocedure)
       is distinct from array['search_path=pg_catalog, public']::text[]
     or (select proconfig from pg_proc where oid = 'public.lookup_customer_phone_identity_v1(uuid,text,uuid)'::regprocedure)
       is distinct from array['search_path=pg_catalog, public, auth']::text[]
     or (select proconfig from pg_proc where oid = 'public.create_customer_with_phone_identity_v1(uuid,uuid,text,text,text,text)'::regprocedure)
       is distinct from array['search_path=pg_catalog, public, auth']::text[] then
    raise exception using errcode = '55000', message = 'CUSTOMER_PHONE_ACL_SEARCH_PATH_DRIFT';
  end if;
end
$preflight$;

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role, afex_core_runtime;

do $owner_access$
begin
  execute format(
    'grant afex_function_owner to %I with set true granted by postgres',
    session_user
  );
end
$owner_access$;

set local role afex_function_owner;

alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated, service_role, afex_core_runtime;

revoke execute on function public.normalize_saudi_customer_phone_v1(text)
  from public, anon, authenticated, service_role, afex_core_runtime;
revoke execute on function public.refresh_customer_phone_identity_v1(uuid, text)
  from public, anon, authenticated, service_role, afex_core_runtime;
revoke execute on function public.prepare_customer_phone_identity_v1()
  from public, anon, authenticated, service_role, afex_core_runtime;
revoke execute on function public.sync_customer_phone_identity_v1()
  from public, anon, authenticated, service_role, afex_core_runtime;
revoke execute on function public.lookup_customer_phone_identity_v1(uuid, text, uuid)
  from public, anon, authenticated, service_role, afex_core_runtime;
revoke execute on function public.create_customer_with_phone_identity_v1(uuid, uuid, text, text, text, text)
  from public, anon, authenticated, service_role, afex_core_runtime;

grant execute on function public.normalize_saudi_customer_phone_v1(text)
  to authenticated, service_role, afex_core_runtime;
grant execute on function public.lookup_customer_phone_identity_v1(uuid, text, uuid)
  to authenticated, service_role, afex_core_runtime;
grant execute on function public.create_customer_with_phone_identity_v1(uuid, uuid, text, text, text, text)
  to authenticated, service_role;

do $verify$
declare
  v_role text;
  v_signature text;
begin
  foreach v_signature in array array[
    'public.refresh_customer_phone_identity_v1(uuid,text)',
    'public.prepare_customer_phone_identity_v1()',
    'public.sync_customer_phone_identity_v1()'
  ] loop
    foreach v_role in array array['anon', 'authenticated', 'service_role', 'afex_core_runtime'] loop
      if has_function_privilege(v_role, v_signature, 'EXECUTE') then
        raise exception using errcode = '55000', message = 'CUSTOMER_PHONE_INTERNAL_FUNCTION_EXPOSED';
      end if;
    end loop;
  end loop;

  if not has_function_privilege('authenticated', 'public.normalize_saudi_customer_phone_v1(text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.normalize_saudi_customer_phone_v1(text)', 'EXECUTE')
     or not has_function_privilege('afex_core_runtime', 'public.normalize_saudi_customer_phone_v1(text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.normalize_saudi_customer_phone_v1(text)', 'EXECUTE') then
    raise exception using errcode = '55000', message = 'CUSTOMER_PHONE_NORMALIZE_ACL_MISMATCH';
  end if;

  if not has_function_privilege('authenticated', 'public.lookup_customer_phone_identity_v1(uuid,text,uuid)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.lookup_customer_phone_identity_v1(uuid,text,uuid)', 'EXECUTE')
     or not has_function_privilege('afex_core_runtime', 'public.lookup_customer_phone_identity_v1(uuid,text,uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.lookup_customer_phone_identity_v1(uuid,text,uuid)', 'EXECUTE') then
    raise exception using errcode = '55000', message = 'CUSTOMER_PHONE_LOOKUP_ACL_MISMATCH';
  end if;

  if not has_function_privilege('authenticated', 'public.create_customer_with_phone_identity_v1(uuid,uuid,text,text,text,text)', 'EXECUTE')
     or not has_function_privilege('service_role', 'public.create_customer_with_phone_identity_v1(uuid,uuid,text,text,text,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.create_customer_with_phone_identity_v1(uuid,uuid,text,text,text,text)', 'EXECUTE')
     or has_function_privilege('afex_core_runtime', 'public.create_customer_with_phone_identity_v1(uuid,uuid,text,text,text,text)', 'EXECUTE') then
    raise exception using errcode = '55000', message = 'CUSTOMER_PHONE_CREATE_ACL_MISMATCH';
  end if;

  if exists (
    select 1
    from pg_proc p
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid in (
      'public.normalize_saudi_customer_phone_v1(text)'::regprocedure,
      'public.refresh_customer_phone_identity_v1(uuid,text)'::regprocedure,
      'public.prepare_customer_phone_identity_v1()'::regprocedure,
      'public.sync_customer_phone_identity_v1()'::regprocedure,
      'public.lookup_customer_phone_identity_v1(uuid,text,uuid)'::regprocedure,
      'public.create_customer_with_phone_identity_v1(uuid,uuid,text,text,text,text)'::regprocedure
    )
      and a.grantee = 0
      and a.privilege_type = 'EXECUTE'
  ) then
    raise exception using errcode = '55000', message = 'CUSTOMER_PHONE_PUBLIC_EXECUTE_REMAINS';
  end if;
end
$verify$;

set local role postgres;

do $owner_access_cleanup$
begin
  execute format(
    'revoke afex_function_owner from %I granted by postgres',
    session_user
  );

  if exists (
    select 1
    from pg_auth_members m
    join pg_roles granted_role on granted_role.oid = m.roleid
    join pg_roles member_role on member_role.oid = m.member
    join pg_roles grantor_role on grantor_role.oid = m.grantor
    where granted_role.rolname = 'afex_function_owner'
      and member_role.rolname = session_user
      and grantor_role.rolname = 'postgres'
  ) then
    raise exception using errcode = '55000', message = 'CUSTOMER_PHONE_ACL_TEMPORARY_OWNER_MEMBERSHIP_REMAINS';
  end if;
end
$owner_access_cleanup$;

commit;
