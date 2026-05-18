begin;

alter table public.branches
  add column if not exists order_number_prefix text;

update public.branches
set tenant_id = public.resolve_default_tenant_id()
where tenant_id is null;

with ranked_branches as (
  select
    id,
    lpad(
      row_number() over (
        partition by tenant_id
        order by
          case
            when coalesce(code, '') = '01'
              or coalesce(name, '') ilike '%الروضة%'
              or coalesce(display_branch_name, '') ilike '%الروضة%'
              then 1
            when coalesce(code, '') = '02'
              or coalesce(name, '') ilike '%الصحافة%'
              or coalesce(display_branch_name, '') ilike '%الصحافة%'
              then 2
            else 100
          end,
          created_at asc,
          id asc
      )::text,
      2,
      '0'
    ) as next_prefix
  from public.branches
)
update public.branches as b
set order_number_prefix = ranked_branches.next_prefix
from ranked_branches
where b.id = ranked_branches.id
  and nullif(trim(coalesce(b.order_number_prefix, '')), '') is null;

create unique index if not exists idx_branches_tenant_order_number_prefix
  on public.branches (tenant_id, order_number_prefix)
  where order_number_prefix is not null;

create table if not exists public.order_number_sequences (
  tenant_id uuid not null,
  branch_id uuid not null references public.branches (id) on update cascade on delete cascade,
  sequence_month date not null,
  last_sequence integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, branch_id, sequence_month)
);

create index if not exists idx_order_number_sequences_branch_month
  on public.order_number_sequences (branch_id, sequence_month);

create or replace function public.ensure_branch_order_number_prefix(
  p_branch_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_prefix text;
  v_next_prefix text;
begin
  if p_branch_id is null then
    raise exception 'Branch is required for order numbering'
      using errcode = '23502';
  end if;

  select tenant_id, nullif(trim(coalesce(order_number_prefix, '')), '')
  into v_tenant_id, v_prefix
  from public.branches
  where id = p_branch_id
  limit 1;

  if v_tenant_id is null then
    raise exception 'Branch not found for order numbering'
      using errcode = '23503';
  end if;

  if v_prefix is not null then
    return v_prefix;
  end if;

  perform pg_advisory_xact_lock(
    hashtext('afex_branch_order_number_prefix'),
    hashtext(v_tenant_id::text)
  );

  select nullif(trim(coalesce(order_number_prefix, '')), '')
  into v_prefix
  from public.branches
  where id = p_branch_id
  limit 1;

  if v_prefix is not null then
    return v_prefix;
  end if;

  select lpad(
    (coalesce(max(order_number_prefix::integer), 0) + 1)::text,
    2,
    '0'
  )
  into v_next_prefix
  from public.branches
  where tenant_id = v_tenant_id
    and order_number_prefix ~ '^[0-9]{2}$';

  update public.branches
  set order_number_prefix = v_next_prefix,
      updated_at = now()
  where id = p_branch_id;

  return v_next_prefix;
end;
$$;

create or replace function public.set_branch_order_number_prefix()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next_prefix text;
begin
  if new.tenant_id is null then
    new.tenant_id := public.resolve_default_tenant_id();
  end if;

  if nullif(trim(coalesce(new.order_number_prefix, '')), '') is not null then
    new.order_number_prefix := lpad(new.order_number_prefix, 2, '0');
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtext('afex_branch_order_number_prefix'),
    hashtext(new.tenant_id::text)
  );

  select lpad(
    (coalesce(max(order_number_prefix::integer), 0) + 1)::text,
    2,
    '0'
  )
  into v_next_prefix
  from public.branches
  where tenant_id = new.tenant_id
    and order_number_prefix ~ '^[0-9]{2}$';

  new.order_number_prefix := v_next_prefix;

  return new;
end;
$$;

drop trigger if exists trg_set_branch_order_number_prefix on public.branches;
create trigger trg_set_branch_order_number_prefix
before insert on public.branches
for each row
execute function public.set_branch_order_number_prefix();

create or replace function public.next_branch_monthly_order_number(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_created_at timestamptz default now()
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
  v_sequence_month date := date_trunc('month', coalesce(p_created_at, now()))::date;
  v_next_sequence integer;
begin
  if p_tenant_id is null then
    raise exception 'Tenant is required for order numbering'
      using errcode = '23502';
  end if;

  if p_branch_id is null then
    raise exception 'Branch is required for order numbering'
      using errcode = '23502';
  end if;

  v_prefix := public.ensure_branch_order_number_prefix(p_branch_id);

  insert into public.order_number_sequences (
    tenant_id,
    branch_id,
    sequence_month,
    last_sequence,
    updated_at
  )
  values (
    p_tenant_id,
    p_branch_id,
    v_sequence_month,
    1,
    now()
  )
  on conflict (tenant_id, branch_id, sequence_month)
  do update
  set last_sequence = public.order_number_sequences.last_sequence + 1,
      updated_at = now()
  returning last_sequence into v_next_sequence;

  return v_prefix || '-' || lpad(v_next_sequence::text, 4, '0');
end;
$$;

create or replace function public.set_order_number_branch_monthly()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid := new.branch_id;
  v_tenant_id uuid := new.tenant_id;
begin
  if v_tenant_id is null and v_branch_id is not null then
    select tenant_id
    into v_tenant_id
    from public.branches
    where id = v_branch_id
    limit 1;
  end if;

  if v_tenant_id is null then
    v_tenant_id := public.resolve_default_tenant_id();
    new.tenant_id := v_tenant_id;
  end if;

  if v_branch_id is null then
    select id
    into v_branch_id
    from public.branches
    where tenant_id = v_tenant_id
      and code = 'main'
    order by created_at asc, id asc
    limit 1;
  end if;

  if v_branch_id is null then
    select id
    into v_branch_id
    from public.branches
    where tenant_id = v_tenant_id
    order by created_at asc, id asc
    limit 1;
  end if;

  if v_branch_id is null then
    raise exception 'Branch is required for order numbering'
      using errcode = '23502';
  end if;

  new.branch_id := v_branch_id;
  new.order_number := public.next_branch_monthly_order_number(
    v_tenant_id,
    v_branch_id,
    coalesce(new.created_at, now())
  );

  return new;
end;
$$;

create or replace function public.set_invoice_number_from_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_number text;
  v_order_tenant_id uuid;
  v_order_branch_id uuid;
begin
  if new.order_id is null then
    return new;
  end if;

  select order_number, tenant_id, branch_id
  into v_order_number, v_order_tenant_id, v_order_branch_id
  from public.orders
  where id = new.order_id
  limit 1;

  if v_order_number is not null then
    new.invoice_number := v_order_number;
  end if;

  if new.tenant_id is null then
    new.tenant_id := v_order_tenant_id;
  end if;

  if new.branch_id is null then
    new.branch_id := v_order_branch_id;
  end if;

  return new;
end;
$$;

do $$
declare
  r record;
begin
  for r in
    select conrelid::regclass as table_name, conname
    from pg_constraint c
    where c.contype = 'u'
      and c.conrelid in ('public.orders'::regclass, 'public.invoices'::regclass)
      and (
        select array_agg(a.attname order by u.ordinality)
        from unnest(c.conkey) with ordinality as u(attnum, ordinality)
        join pg_attribute a
          on a.attrelid = c.conrelid
         and a.attnum = u.attnum
      ) in (array['order_number']::text[], array['invoice_number']::text[])
  loop
    execute format('alter table %s drop constraint if exists %I', r.table_name, r.conname);
  end loop;
end
$$;

do $$
declare
  r record;
begin
  for r in
    select i.indexrelid::regclass as index_name
    from pg_index i
    join pg_attribute a
      on a.attrelid = i.indrelid
     and i.indkey::text = a.attnum::text
    where i.indrelid in ('public.orders'::regclass, 'public.invoices'::regclass)
      and i.indisunique
      and not i.indisprimary
      and not exists (
        select 1
        from pg_constraint c
        where c.conindid = i.indexrelid
      )
      and a.attname in ('order_number', 'invoice_number')
  loop
    execute format('drop index if exists %s', r.index_name);
  end loop;
end
$$;

drop trigger if exists trg_zz_set_order_number_branch_monthly on public.orders;
create trigger trg_zz_set_order_number_branch_monthly
before insert on public.orders
for each row
execute function public.set_order_number_branch_monthly();

drop trigger if exists trg_zz_set_invoice_number_from_order on public.invoices;
create trigger trg_zz_set_invoice_number_from_order
before insert on public.invoices
for each row
execute function public.set_invoice_number_from_order();

create index if not exists idx_orders_tenant_branch_created_number
  on public.orders (tenant_id, branch_id, created_at, order_number);

create index if not exists idx_invoices_tenant_branch_created_number
  on public.invoices (tenant_id, branch_id, created_at, invoice_number);

create unique index if not exists idx_orders_tenant_branch_month_order_number_unique
  on public.orders (
    tenant_id,
    branch_id,
    ((date_trunc('month', created_at at time zone 'UTC'))::date),
    order_number
  )
  where tenant_id is not null
    and branch_id is not null
    and order_number is not null;

create unique index if not exists idx_invoices_tenant_branch_month_invoice_number_unique
  on public.invoices (
    tenant_id,
    branch_id,
    ((date_trunc('month', created_at at time zone 'UTC'))::date),
    invoice_number
  )
  where tenant_id is not null
    and branch_id is not null
    and invoice_number is not null;

commit;
