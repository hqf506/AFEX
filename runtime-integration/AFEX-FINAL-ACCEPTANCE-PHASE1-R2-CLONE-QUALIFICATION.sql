\set ON_ERROR_STOP on

begin;

do $qualification_installer_preflight$
begin
  if current_user <> session_user or
     not pg_catalog.pg_has_role(session_user,'postgres','SET') then
    raise exception 'QUALIFICATION_TEMPORARY_LOGIN_TOPOLOGY_INVALID';
  end if;
end
$qualification_installer_preflight$;

set local role postgres;

do $tests$
declare
  v record;
  v_count bigint;
  v_old timestamptz := clock_timestamp() - interval '91 days';
begin
  if (select count(*) from pg_catalog.pg_auth_members m
      join pg_catalog.pg_roles r on r.oid=m.roleid
      join pg_catalog.pg_roles member_role on member_role.oid=m.member
      where r.rolname in ('afex_pos_session_owner','afex_pos_session_maintenance')
        and member_role.rolname=current_user
        and m.admin_option and not m.inherit_option and not m.set_option) <> 2 then
    raise exception 'EXPECTED_CREATOR_ADMINISTRATION_EDGES_INVALID';
  end if;
  if exists (
    select 1 from pg_catalog.pg_auth_members m
    join pg_catalog.pg_roles r on r.oid=m.roleid
    where r.rolname in ('afex_pos_session_owner','afex_pos_session_maintenance')
      and (m.set_option or m.inherit_option)
  ) then
    raise exception 'DANGEROUS_RUNTIME_MEMBERSHIP_PRESENT';
  end if;
  if exists (
    select 1 from pg_catalog.pg_roles
    where rolname like 'afex_pos_session_%'
      and rolname not in ('afex_pos_session_owner','afex_pos_session_maintenance')
  ) then
    raise exception 'UNEXPECTED_POS_SESSION_OWNER_ROLE';
  end if;
  if has_table_privilege('service_role',(select c.oid from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='afex_pos_authority' and c.relname='actor_sessions'),'SELECT') or
     has_table_privilege('anon',(select c.oid from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='afex_pos_authority' and c.relname='actor_sessions'),'SELECT') or
     has_table_privilege('authenticated',(select c.oid from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='afex_pos_authority' and c.relname='actor_sessions'),'SELECT') then
    raise exception 'DIRECT_TABLE_ACCESS_EXPOSED';
  end if;
  if has_function_privilege('service_role','public.cleanup_pos_actor_sessions_v1(integer)','EXECUTE') then
    raise exception 'CLEANUP_EXPOSED';
  end if;

  execute 'grant afex_pos_session_owner to postgres with admin false, inherit false, set true granted by postgres';
  perform pg_catalog.set_config('role','afex_pos_session_owner',true);

  select * into strict v from public.issue_pos_actor_session_v1(
    repeat('a',64),'40000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001','2468',
    '20000000-0000-0000-0000-000000000001'
  );
  select * into strict v from public.validate_pos_actor_session_v1(
    repeat('a',64),'40000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001'
  );
  if v.actor_id <> '50000000-0000-0000-0000-000000000001'::uuid then
    raise exception 'EFFECTIVE_ACTOR_MISMATCH';
  end if;

  begin
    perform public.issue_pos_actor_session_v1(
      repeat('b',64),'40000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001','9999',null
    );
    raise exception 'INVALID_PIN_ACCEPTED';
  exception when sqlstate '28000' then null; end;

  select * into strict v from public.pos_actor_session_state_v1(
    '40000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001'
  );
  if v.authority_state <> 'ACTIVE_RESTRICTION' or not v.restriction_required then
    raise exception 'MISSING_COOKIE_STATE_NOT_RESTRICTED';
  end if;

  if not public.revoke_pos_actor_session_v1(
    repeat('a',64),'40000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001','LOGOUT'
  ) then raise exception 'LOGOUT_REVOCATION_FAILED'; end if;
  select * into strict v from public.pos_actor_session_state_v1(
    '40000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001'
  );
  if v.authority_state <> 'REVOKED' or not v.restriction_required then
    raise exception 'REVOKED_STATE_RESTORED_AUTHORITY';
  end if;

  perform public.issue_pos_actor_session_v1(
    repeat('c',64),'40000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001','2468',
    '20000000-0000-0000-0000-000000000001'
  );
  perform public.revoke_pos_actor_session_v1(
    repeat('c',64),'40000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001','ADMIN_REAUTH'
  );
  select * into strict v from public.pos_actor_session_state_v1(
    '40000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001'
  );
  if not v.restriction_required then raise exception 'ADMIN_REAUTH_PRE_SIGNOUT_NOT_RESTRICTED'; end if;

  perform public.issue_pos_actor_session_v1(
    repeat('d',64),'40000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001','2468',
    '20000000-0000-0000-0000-000000000001'
  );
  perform public.revoke_pos_actor_session_v1(
    repeat('d',64),'40000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001','SECURITY_RESET'
  );
  select * into strict v from public.pos_actor_session_state_v1(
    '40000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001'
  );
  if not v.restriction_required then raise exception 'SECURITY_RESET_NOT_RESTRICTED'; end if;

  select * into strict v from public.pos_actor_session_state_v1(
    '40000000-0000-0000-0000-000000000099',
    '30000000-0000-0000-0000-000000000001'
  );
  if v.authority_state <> 'NO_RESTRICTION' or v.restriction_required then
    raise exception 'NEW_AUTH_SESSION_INCORRECTLY_RESTRICTED';
  end if;

  perform public.issue_pos_actor_session_v1(
    repeat('7',64),'40000000-0000-0000-0000-000000000007',
    '30000000-0000-0000-0000-000000000001','2468',
    '20000000-0000-0000-0000-000000000001'
  );
  update public.profiles set is_active=false
  where id='30000000-0000-0000-0000-000000000001';
  perform public.validate_pos_actor_session_v1(
    repeat('7',64),'40000000-0000-0000-0000-000000000007',
    '30000000-0000-0000-0000-000000000001'
  );
  if not exists (select 1 from afex_pos_authority.actor_sessions
    where token_hash=repeat('7',64) and revocation_reason='SUBJECT_DISABLED') then
    raise exception 'SUBJECT_DISABLE_NOT_REVOKED';
  end if;
  update public.profiles set is_active=true
  where id='30000000-0000-0000-0000-000000000001';

  perform public.issue_pos_actor_session_v1(
    repeat('8',64),'40000000-0000-0000-0000-000000000008',
    '30000000-0000-0000-0000-000000000001','2468',
    '20000000-0000-0000-0000-000000000001'
  );
  update public.profiles set tenant_id='10000000-0000-0000-0000-000000000002'
  where id='30000000-0000-0000-0000-000000000001';
  perform public.validate_pos_actor_session_v1(
    repeat('8',64),'40000000-0000-0000-0000-000000000008',
    '30000000-0000-0000-0000-000000000001'
  );
  if not exists (select 1 from afex_pos_authority.actor_sessions
    where token_hash=repeat('8',64) and revocation_reason='SUBJECT_TENANT_CHANGED') then
    raise exception 'SUBJECT_TENANT_CHANGE_NOT_REVOKED';
  end if;
  update public.profiles set tenant_id='10000000-0000-0000-0000-000000000001'
  where id='30000000-0000-0000-0000-000000000001';

  perform public.issue_pos_actor_session_v1(
    repeat('9',64),'40000000-0000-0000-0000-000000000009',
    '30000000-0000-0000-0000-000000000001','2468',
    '20000000-0000-0000-0000-000000000001'
  );
  perform pg_catalog.set_config('role','postgres',true);
  delete from public.profiles
  where id='30000000-0000-0000-0000-000000000001';
  perform pg_catalog.set_config('role','afex_pos_session_owner',true);
  perform public.validate_pos_actor_session_v1(
    repeat('9',64),'40000000-0000-0000-0000-000000000009',
    '30000000-0000-0000-0000-000000000001'
  );
  if not exists (select 1 from afex_pos_authority.actor_sessions
    where token_hash=repeat('9',64) and revocation_reason='SUBJECT_DELETED') then
    raise exception 'SUBJECT_DELETE_NOT_REVOKED';
  end if;
  perform pg_catalog.set_config('role','postgres',true);
  insert into public.profiles values (
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001','admin',true,clock_timestamp()
  );
  perform pg_catalog.set_config('role','afex_pos_session_owner',true);

  begin
    perform public.revoke_pos_actor_session_v1(
      null,'40000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001','LOGOUT'
    );
    raise exception 'NULL_TOKEN_HASH_ACCEPTED';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.revoke_pos_actor_session_v1(
      'invalid','40000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001','LOGOUT'
    );
    raise exception 'INVALID_TOKEN_HASH_ACCEPTED';
  exception when sqlstate '22023' then null; end;

  begin
    perform public.revoke_pos_actor_sessions_for_actor_v1(
      '30000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001',
      '50000000-0000-0000-0000-000000000002','ACTOR_DISABLED'
    );
    raise exception 'CROSS_TENANT_REVOCATION_ACCEPTED';
  exception when sqlstate '42501' then null; end;

  perform public.issue_pos_actor_session_v1(
    repeat('f',64),'40000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001','2468',
    '20000000-0000-0000-0000-000000000001'
  );
  update public.pos_profiles set is_active=false
  where id='50000000-0000-0000-0000-000000000001';
  perform public.validate_pos_actor_session_v1(
    repeat('f',64),'40000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001'
  );
  select count(*) into v_count from afex_pos_authority.actor_sessions
  where token_hash=repeat('f',64) and revocation_reason='ACTOR_DISABLED';
  if v_count<>1 then raise exception 'DISABLE_RACE_NOT_REVOKED'; end if;

  select * into strict v from public.pos_actor_session_state_v1(
    '40000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001'
  );
  if not v.restriction_required then raise exception 'ACTOR_DISABLED_NOT_RESTRICTED'; end if;

  if exists(select 1 from afex_pos_authority.actor_sessions where token_hash=repeat('a',64)) is not true then
    raise exception 'RETAINED_EVIDENCE_LOST';
  end if;

  insert into afex_pos_authority.auth_session_locks(
    authenticated_subject_id, authenticated_session_id, created_at
  ) values (
    '30000000-0000-0000-0000-000000000099',
    '40000000-0000-0000-0000-000000000099',
    clock_timestamp() - interval '91 days'
  );
  insert into afex_pos_authority.auth_session_locks(
    authenticated_subject_id, authenticated_session_id, created_at, authority_issued_at
  ) values (
    '30000000-0000-0000-0000-000000000001',
    '40000000-0000-0000-0000-000000000091',
    v_old,
    v_old
  );
  insert into afex_pos_authority.actor_sessions(
    token_hash, authenticated_subject_id, tenant_id, branch_id, actor_id,
    actor_role, actor_version, credential_fingerprint, authenticated_session_id,
    issued_at, expires_at, revoked_at, revocation_reason
  ) select repeat('e',64),
    '30000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001', pp.id, pp.role, pp.updated_at,
    'afex-pos-pin-v1:' || repeat('e',64),
    '40000000-0000-0000-0000-000000000091',
    v_old,
    v_old + interval '8 hours',
    v_old + interval '1 hour', 'LOGOUT'
  from public.pos_profiles pp
  where pp.id='50000000-0000-0000-0000-000000000001';
  perform pg_catalog.set_config('role','postgres',true);
  execute 'grant afex_pos_session_maintenance to postgres with admin false, inherit false, set true granted by postgres';
  perform pg_catalog.set_config('role','afex_pos_session_maintenance',true);
  select public.cleanup_pos_actor_sessions_v1(10) into v_count;
  if v_count <> 2 then raise exception 'DETAIL_AND_ORPHAN_CLEANUP_COUNT_INVALID'; end if;
  perform pg_catalog.set_config('role','postgres',true);
  execute 'revoke afex_pos_session_maintenance from postgres granted by postgres';
  perform pg_catalog.set_config('role','afex_pos_session_owner',true);
  if exists (
    select 1 from afex_pos_authority.auth_session_locks
    where authenticated_subject_id='30000000-0000-0000-0000-000000000099'
      and authenticated_session_id='40000000-0000-0000-0000-000000000099'
  ) then raise exception 'OLD_ORPHAN_LOCK_RETAINED'; end if;
  if not exists (
    select 1 from afex_pos_authority.auth_session_locks
    where authenticated_subject_id='30000000-0000-0000-0000-000000000001'
      and authenticated_session_id='40000000-0000-0000-0000-000000000001'
  ) then raise exception 'EVIDENCE_BOUND_LOCK_REMOVED'; end if;
  if exists (select 1 from afex_pos_authority.actor_sessions
    where authenticated_session_id='40000000-0000-0000-0000-000000000091') then
    raise exception 'OLD_DETAIL_NOT_REMOVED';
  end if;
  if not exists (select 1 from afex_pos_authority.auth_session_locks
    where authenticated_session_id='40000000-0000-0000-0000-000000000091'
      and authority_issued_at is not null) then
    raise exception 'PERMANENT_TOMBSTONE_REMOVED';
  end if;
  select * into strict v from public.pos_actor_session_state_v1(
    '40000000-0000-0000-0000-000000000091',
    '30000000-0000-0000-0000-000000000001'
  );
  if not v.restriction_required or v.authority_state <> 'REVOKED' then
    raise exception 'NINETY_ONE_DAY_AUTH_SESSION_RESTORED_AUTHORITY';
  end if;
  perform pg_catalog.set_config('role','postgres',true);
  execute 'revoke afex_pos_session_owner from postgres granted by postgres';
end
$tests$;

select 'PASS' as clone_qualification_result,
       0 as dangerous_runtime_memberships,
       0 as set_capable_memberships,
       0 as unexpected_memberships,
       2 as expected_creator_administration_edges;

commit;
