\set ON_ERROR_STOP on

create or replace function pg_temp.assert_r3d_creator_contract(p_excluded_role text default null)
returns void language plpgsql as $f$
declare
  v_installer oid := (select oid from pg_catalog.pg_roles where rolname=current_user);
  v_expected_grantor oid;
  v_count integer;
begin
  select min(m.grantor) into v_expected_grantor
  from pg_catalog.pg_auth_members m
  join pg_catalog.pg_roles r on r.oid=m.roleid
  where r.rolname in (
    'afex_context_issuer','afex_core_owner','afex_core_runtime',
    'afex_function_owner','afex_outbox_worker'
  ) and m.member=v_installer and m.admin_option
    and not m.inherit_option and not m.set_option;

  select count(*) into v_count
  from pg_catalog.pg_auth_members m
  join pg_catalog.pg_roles r on r.oid=m.roleid
  where r.rolname in ('afex_pos_session_owner','afex_pos_session_maintenance')
    and r.rolname is distinct from p_excluded_role
    and m.member=v_installer and m.grantor=v_expected_grantor
    and m.admin_option and not m.inherit_option and not m.set_option;

  if v_count <> 2 or exists (
    select 1 from pg_catalog.pg_auth_members m
    join pg_catalog.pg_roles r on r.oid=m.roleid
    where r.rolname in ('afex_pos_session_owner','afex_pos_session_maintenance')
      and not (
        r.rolname is distinct from p_excluded_role and
        m.member=v_installer and m.grantor=v_expected_grantor and
        m.admin_option and not m.inherit_option and not m.set_option
      )
  ) or exists (
    select 1 from pg_catalog.pg_roles
    where rolname like 'afex_pos_session_%'
      and rolname not in ('afex_pos_session_owner','afex_pos_session_maintenance')
  ) then
    raise exception 'R3D_NEGATIVE_DETECTED';
  end if;
end
$f$;

do $tests$
declare
  v_case text;
begin
  for v_case in select unnest(array[
    'service_role','authenticated','set_true','inherit_true','wrong_member',
    'wrong_grantor','wrong_owner_role','parallel_edge','missing_expected_edge'
  ]) loop
    begin
      case v_case
        when 'service_role' then
          execute format('grant afex_pos_session_owner to service_role with admin false, inherit false, set false granted by %I',session_user);
        when 'authenticated' then
          execute format('grant afex_pos_session_owner to authenticated with admin false, inherit false, set false granted by %I',session_user);
        when 'set_true' then
          execute format('grant afex_pos_session_owner to %I with admin false, inherit false, set true granted by %I',session_user,session_user);
        when 'inherit_true' then
          execute format('grant afex_pos_session_owner to %I with admin false, inherit true, set false granted by %I',session_user,session_user);
        when 'wrong_member' then
          execute format('grant afex_pos_session_maintenance to anon with admin false, inherit false, set false granted by %I',session_user);
        when 'wrong_grantor' then
          execute format('grant afex_pos_session_maintenance to %I with admin false, inherit false, set false granted by %I',session_user,session_user);
        when 'wrong_owner_role' then
          execute 'create role afex_pos_session_unexpected_owner nologin noinherit';
        when 'parallel_edge' then
          execute format('grant afex_pos_session_owner to %I with admin false, inherit false, set false granted by %I',session_user,session_user);
        when 'missing_expected_edge' then
          perform pg_temp.assert_r3d_creator_contract('afex_pos_session_owner');
      end case;

      if v_case <> 'missing_expected_edge' then
        perform pg_temp.assert_r3d_creator_contract();
      end if;
      raise exception 'R3D_NEGATIVE_NOT_DETECTED:%',v_case;
    exception
      when raise_exception then
        if sqlerrm <> 'R3D_NEGATIVE_DETECTED' then
          raise;
        end if;
    end;
  end loop;
end
$tests$;

select 'PASS' as negative_membership_matrix,
       9 as negative_case_count;
