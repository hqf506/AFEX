\set ON_ERROR_STOP off

begin;
create role afex_r2_fail_role nologin;
do $$begin raise exception 'INJECT_AFTER_ROLE'; end$$;
rollback;

begin;
create role afex_r2_fail_role nologin;
do $$begin execute format(
  'grant afex_r2_fail_role to %I with admin false, inherit false, set true granted by %I',
  session_user,session_user
); end$$;
do $$begin raise exception 'INJECT_AFTER_TEMPORARY_SET'; end$$;
rollback;

begin;
create role afex_r2_fail_role nologin;
do $$begin execute format(
  'grant afex_r2_fail_role to %I with admin false, inherit false, set true granted by %I',
  session_user,session_user
); end$$;
create schema afex_r2_fail authorization afex_r2_fail_role;
do $$begin raise exception 'INJECT_AFTER_SCHEMA'; end$$;
rollback;

begin;
create role afex_r2_fail_role nologin;
do $$begin execute format(
  'grant afex_r2_fail_role to %I with admin false, inherit false, set true granted by %I',
  session_user,session_user
); end$$;
create schema afex_r2_fail authorization afex_r2_fail_role;
set local role afex_r2_fail_role;
create table afex_r2_fail.t(id bigint primary key);
do $$begin raise exception 'INJECT_AFTER_TABLE'; end$$;
rollback;

begin;
create role afex_r2_fail_role nologin;
do $$begin execute format(
  'grant afex_r2_fail_role to %I with admin false, inherit false, set true granted by %I',
  session_user,session_user
); end$$;
create schema afex_r2_fail authorization afex_r2_fail_role;
create function public.afex_r2_fail() returns boolean language sql as $$select true$$;
do $$begin raise exception 'INJECT_AFTER_FUNCTION'; end$$;
rollback;

begin;
create role afex_r2_fail_role nologin;
do $$begin execute format(
  'grant afex_r2_fail_role to %I with admin false, inherit false, set true granted by %I',
  session_user,session_user
); end$$;
create schema afex_r2_fail authorization afex_r2_fail_role;
create function public.afex_r2_fail() returns boolean language sql as $$select true$$;
grant execute on function public.afex_r2_fail() to service_role;
do $$begin raise exception 'INJECT_AFTER_GRANT'; end$$;
rollback;

\set ON_ERROR_STOP on
do $verify$
begin
  if exists(select 1 from pg_roles where rolname='afex_r2_fail_role') or
     to_regnamespace('afex_r2_fail') is not null or
     to_regprocedure('public.afex_r2_fail()') is not null then
    raise exception 'FAILURE_INJECTION_RESIDUE';
  end if;
end
$verify$;
select 'PASS' as failure_injection_rollback_result,
       0 as residual_r2_roles,
       0 as residual_set_capable_edges;
