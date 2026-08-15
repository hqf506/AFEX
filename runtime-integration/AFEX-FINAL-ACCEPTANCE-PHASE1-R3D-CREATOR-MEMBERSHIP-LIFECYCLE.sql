\set ON_ERROR_STOP on
begin;

create role afex_r3d_probe_owner nologin noinherit;
create role afex_r3d_probe_maintenance nologin noinherit;

select 'AFTER_ROLE_CREATION' stage,
       count(*) total_edges,
       count(*) filter (where admin_option and not inherit_option and not set_option) creator_admin_edges,
       count(*) filter (where set_option) set_capable_edges
from pg_catalog.pg_auth_members m
join pg_catalog.pg_roles r on r.oid=m.roleid
where r.rolname in ('afex_r3d_probe_owner','afex_r3d_probe_maintenance');

do $grant_set$
declare v_role text;
begin
  for v_role in select unnest(array['afex_r3d_probe_owner','afex_r3d_probe_maintenance']) loop
    execute format(
      'grant %I to %I with admin false, inherit false, set true granted by %I',
      v_role,session_user,session_user
    );
  end loop;
end
$grant_set$;

select 'DURING_OWNER_DDL' stage,
       count(*) total_edges,
       count(*) filter (where admin_option and not inherit_option and not set_option) creator_admin_edges,
       count(*) filter (where set_option and not inherit_option) set_capable_edges
from pg_catalog.pg_auth_members m
join pg_catalog.pg_roles r on r.oid=m.roleid
where r.rolname in ('afex_r3d_probe_owner','afex_r3d_probe_maintenance');

do $remove_set$
declare v_role text;
begin
  for v_role in select unnest(array['afex_r3d_probe_owner','afex_r3d_probe_maintenance']) loop
    execute format('revoke %I from %I granted by %I',v_role,session_user,session_user);
  end loop;
end
$remove_set$;

select 'AFTER_SET_REMOVAL' stage,
       count(*) total_edges,
       count(*) filter (where admin_option and not inherit_option and not set_option) creator_admin_edges,
       count(*) filter (where set_option or inherit_option) dangerous_edges
from pg_catalog.pg_auth_members m
join pg_catalog.pg_roles r on r.oid=m.roleid
where r.rolname in ('afex_r3d_probe_owner','afex_r3d_probe_maintenance');

rollback;

select 'AFTER_ROLLBACK' stage,
       count(*) remaining_probe_roles
from pg_catalog.pg_roles
where rolname in ('afex_r3d_probe_owner','afex_r3d_probe_maintenance');
