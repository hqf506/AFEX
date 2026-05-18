begin;

alter table public.branches
  add column if not exists order_number_prefix text;

create unique index if not exists idx_branches_tenant_order_number_prefix
  on public.branches (tenant_id, order_number_prefix)
  where order_number_prefix is not null;

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

  select b.tenant_id, nullif(trim(coalesce(b.order_number_prefix, '')), '')
  into v_tenant_id, v_prefix
  from public.branches as b
  where b.id = p_branch_id
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

  select nullif(trim(coalesce(b.order_number_prefix, '')), '')
  into v_prefix
  from public.branches as b
  where b.id = p_branch_id
  limit 1;

  if v_prefix is not null then
    return v_prefix;
  end if;

  select lpad(
    (coalesce(max(b.order_number_prefix::integer), 0) + 1)::text,
    2,
    '0'
  )
  into v_next_prefix
  from public.branches as b
  where b.tenant_id = v_tenant_id
    and b.order_number_prefix ~ '^[0-9]{2}$';

  update public.branches as b
  set order_number_prefix = v_next_prefix,
      updated_at = now()
  where b.id = p_branch_id
    and b.tenant_id = v_tenant_id;

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
    (coalesce(max(b.order_number_prefix::integer), 0) + 1)::text,
    2,
    '0'
  )
  into v_next_prefix
  from public.branches as b
  where b.tenant_id = new.tenant_id
    and b.order_number_prefix ~ '^[0-9]{2}$';

  new.order_number_prefix := v_next_prefix;

  return new;
end;
$$;

drop trigger if exists trg_set_branch_order_number_prefix on public.branches;
create trigger trg_set_branch_order_number_prefix
before insert on public.branches
for each row
execute function public.set_branch_order_number_prefix();

with tenant_max_prefixes as (
  select
    b.tenant_id,
    coalesce(max(b.order_number_prefix::integer), 0) as max_prefix
  from public.branches as b
  where b.order_number_prefix ~ '^[0-9]{2}$'
  group by b.tenant_id
),
branches_missing_prefix as (
  select
    b.id,
    b.tenant_id,
    lpad(
      (
        coalesce(tmp.max_prefix, 0)
        + row_number() over (
          partition by b.tenant_id
          order by b.created_at asc nulls last, b.id asc
        )
      )::text,
      2,
      '0'
    ) as next_prefix
  from public.branches as b
  left join tenant_max_prefixes as tmp
    on tmp.tenant_id = b.tenant_id
  where nullif(trim(coalesce(b.order_number_prefix, '')), '') is null
)
update public.branches as b
set order_number_prefix = bmp.next_prefix,
    updated_at = now()
from branches_missing_prefix as bmp
where b.id = bmp.id
  and b.tenant_id = bmp.tenant_id;

commit;
