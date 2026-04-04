begin;

-- Resolve branch_id for new core records from the authenticated user's profile.
-- Branch-scoped users must have a valid branch_id; otherwise the write fails.
-- System-scoped admins may still fall back to the default "main" branch.
create or replace function public.resolve_insert_branch_id(
  requested_branch_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_branch_id uuid;
  profile_role text;
begin
  if requested_branch_id is not null then
    return requested_branch_id;
  end if;

  select p.role, p.branch_id
  into profile_role, resolved_branch_id
  from public.profiles p
  where p.id = auth.uid()
  limit 1;

  if resolved_branch_id is not null then
    return resolved_branch_id;
  end if;

  if profile_role is distinct from 'admin' then
    raise exception 'Branch-scoped writes require a valid branch_id on the authenticated profile'
      using errcode = '23514';
  end if;

  select b.id
  into resolved_branch_id
  from public.branches b
  where b.code = 'main'
  limit 1;

  return resolved_branch_id;
end;
$$;

-- Apply branch assignment automatically for new customer rows.
create or replace function public.set_customers_branch_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.branch_id is null then
    new.branch_id := public.resolve_insert_branch_id(new.branch_id);
  end if;

  return new;
end;
$$;

-- Apply branch assignment automatically for new order rows.
create or replace function public.set_orders_branch_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.branch_id is null then
    new.branch_id := public.resolve_insert_branch_id(new.branch_id);
  end if;

  return new;
end;
$$;

-- Apply branch assignment automatically for new invoice rows.
create or replace function public.set_invoices_branch_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.branch_id is null then
    new.branch_id := public.resolve_insert_branch_id(new.branch_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_set_customers_branch_id on public.customers;
create trigger trg_set_customers_branch_id
before insert on public.customers
for each row
execute function public.set_customers_branch_id();

drop trigger if exists trg_set_orders_branch_id on public.orders;
create trigger trg_set_orders_branch_id
before insert on public.orders
for each row
execute function public.set_orders_branch_id();

drop trigger if exists trg_set_invoices_branch_id on public.invoices;
create trigger trg_set_invoices_branch_id
before insert on public.invoices
for each row
execute function public.set_invoices_branch_id();

commit;
