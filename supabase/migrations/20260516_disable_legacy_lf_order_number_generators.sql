begin;

do $$
declare
  r record;
begin
  for r in
    select
      t.tgrelid::regclass as table_name,
      t.tgname as trigger_name
    from pg_trigger t
    join pg_proc p
      on p.oid = t.tgfoid
    where not t.tgisinternal
      and t.tgrelid in ('public.orders'::regclass, 'public.invoices'::regclass)
      and t.tgname not in (
        'trg_zzzz_set_order_number_branch_monthly',
        'trg_zzzz_set_invoice_number_from_order'
      )
      and pg_get_functiondef(p.oid) ilike '%LF-%'
  loop
    execute format('drop trigger if exists %I on %s', r.trigger_name, r.table_name);
  end loop;
end
$$;

alter table public.orders
  alter column order_number drop default;

alter table public.invoices
  alter column invoice_number drop default;

drop trigger if exists trg_zz_set_order_number_branch_monthly on public.orders;
drop trigger if exists trg_zzzz_set_order_number_branch_monthly on public.orders;
create trigger trg_zzzz_set_order_number_branch_monthly
before insert on public.orders
for each row
execute function public.set_order_number_branch_monthly();

drop trigger if exists trg_zz_set_invoice_number_from_order on public.invoices;
drop trigger if exists trg_zzzz_set_invoice_number_from_order on public.invoices;
create trigger trg_zzzz_set_invoice_number_from_order
before insert on public.invoices
for each row
execute function public.set_invoice_number_from_order();

commit;
