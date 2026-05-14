-- Allow receipt cancellation by extending the existing invoices.payment_status check.
-- This migration preserves the current CHECK expression and only adds the
-- cancelled payment status as an additional accepted value.

do $$
declare
  v_constraint_oid oid;
  v_constraint_name text;
  v_constraint_definition text;
  v_constraint_expression text;
begin
  select c.oid, c.conname, pg_get_constraintdef(c.oid)
  into v_constraint_oid, v_constraint_name, v_constraint_definition
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'invoices'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%payment_status%'
  order by
    case when c.conname = 'invoices_payment_status_check' then 0 else 1 end,
    c.conname
  limit 1;

  if v_constraint_oid is null then
    alter table public.invoices
      add constraint invoices_payment_status_check
      check (payment_status is null or payment_status in ('paid', 'pending', 'cancelled'));
    return;
  end if;

  if v_constraint_definition ilike '%cancelled%' then
    return;
  end if;

  v_constraint_expression := regexp_replace(
    v_constraint_definition,
    '^CHECK \((.*)\)$',
    '\1'
  );

  execute format(
    'alter table public.invoices drop constraint %I',
    v_constraint_name
  );

  execute format(
    'alter table public.invoices add constraint %I check ((%s) or payment_status = %L)',
    v_constraint_name,
    v_constraint_expression,
    'cancelled'
  );
end $$;
