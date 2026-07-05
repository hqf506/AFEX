begin;

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
  v_stored_sequence integer;
  v_highest_existing_sequence integer;
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

  perform pg_advisory_xact_lock(
    hashtext('afex_branch_monthly_order_number'),
    hashtext(p_tenant_id::text || ':' || p_branch_id::text || ':' || v_sequence_month::text)
  );

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
    0,
    now()
  )
  on conflict (tenant_id, branch_id, sequence_month)
  do nothing;

  select ons.last_sequence
  into v_stored_sequence
  from public.order_number_sequences as ons
  where ons.tenant_id = p_tenant_id
    and ons.branch_id = p_branch_id
    and ons.sequence_month = v_sequence_month
  for update;

  select coalesce(max((substring(o.order_number from length(v_prefix) + 2))::integer), 0)
  into v_highest_existing_sequence
  from public.orders as o
  where o.tenant_id = p_tenant_id
    and o.branch_id = p_branch_id
    and date_trunc('month', coalesce(o.created_at, now()))::date = v_sequence_month
    and left(o.order_number, length(v_prefix) + 1) = v_prefix || '-'
    and substring(o.order_number from length(v_prefix) + 2) ~ '^[0-9]+$';

  if v_highest_existing_sequence > v_stored_sequence then
    update public.order_number_sequences as ons
    set last_sequence = v_highest_existing_sequence,
        updated_at = now()
    where ons.tenant_id = p_tenant_id
      and ons.branch_id = p_branch_id
      and ons.sequence_month = v_sequence_month;
  end if;

  update public.order_number_sequences as ons
  set last_sequence = ons.last_sequence + 1,
      updated_at = now()
  where ons.tenant_id = p_tenant_id
    and ons.branch_id = p_branch_id
    and ons.sequence_month = v_sequence_month
  returning ons.last_sequence into v_next_sequence;

  return v_prefix || '-' || lpad(v_next_sequence::text, 4, '0');
end;
$$;

commit;
