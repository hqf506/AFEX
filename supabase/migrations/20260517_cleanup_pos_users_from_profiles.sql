begin;

/*
Diagnostic: review the rows that this migration is allowed to remove.

select
  p.id,
  p.tenant_id,
  p.branch_id,
  p.username,
  p.full_name,
  p.role,
  p.is_active,
  p.created_at
from public.profiles p
where p.role in ('cashier', 'employee')
  and p.tenant_id is not null
  and p.username is not null
  and exists (
    select 1
    from public.pos_profiles pp
    where pp.tenant_id = p.tenant_id
      and lower(trim(pp.username)) = lower(trim(p.username))
  )
order by p.tenant_id, lower(trim(p.username));

Diagnostic: review restrictive foreign keys before deleting.

select
  conrelid::regclass as referencing_table,
  conname as constraint_name,
  confdeltype as delete_action
from pg_constraint
where contype = 'f'
  and confrelid = 'public.profiles'::regclass
  and confdeltype in ('a', 'r');
*/

do $$
declare
  v_blocking_constraints text;
begin
  select string_agg(conrelid::regclass::text || '.' || conname, ', ')
  into v_blocking_constraints
  from pg_constraint
  where contype = 'f'
    and confrelid = 'public.profiles'::regclass
    and confdeltype in ('a', 'r');

  if v_blocking_constraints is not null then
    raise exception
      'Refusing to cleanup POS profiles because restrictive foreign keys reference public.profiles: %',
      v_blocking_constraints;
  end if;
end;
$$;

delete from public.profiles p
where p.role in ('cashier', 'employee')
  and p.tenant_id is not null
  and p.username is not null
  and exists (
    select 1
    from public.pos_profiles pp
    where pp.tenant_id = p.tenant_id
      and lower(trim(pp.username)) = lower(trim(p.username))
  );

commit;
