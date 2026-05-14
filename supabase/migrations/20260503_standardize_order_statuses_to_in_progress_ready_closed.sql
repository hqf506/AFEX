begin;

update public.orders
set status = case
  when status in ('new', 'pending', 'processing') then 'in_progress'
  when status in ('delivered', 'completed') then 'closed'
  when status = 'ready' then 'ready'
  else status
end;

do $$
declare
  status_constraint record;
begin
  for status_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.orders'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format(
      'alter table public.orders drop constraint if exists %I',
      status_constraint.conname
    );
  end loop;

  alter table public.orders
    add constraint orders_status_check
    check (status in ('in_progress', 'ready', 'closed'));
end
$$;

commit;
