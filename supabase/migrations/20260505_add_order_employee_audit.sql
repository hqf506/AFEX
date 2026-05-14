begin;

alter table public.orders
add column if not exists created_by_employee_id uuid null;

create or replace function public.create_invoice_with_items_safe(
  p_customer_name text,
  p_customer_phone text,
  p_customer_notes text default '',
  p_payment_method text default 'cash',
  p_discount numeric default 0,
  p_tax numeric default 0,
  p_note text default '',
  p_items jsonb default '[]'::jsonb,
  p_client_idempotency_key text default '',
  p_created_by_employee_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_order_id uuid;
begin
  v_result := public.create_invoice_with_items_safe(
    p_customer_name,
    p_customer_phone,
    p_customer_notes,
    p_payment_method,
    p_discount,
    p_tax,
    p_note,
    coalesce(p_items, '[]'::jsonb),
    p_client_idempotency_key
  );

  if p_created_by_employee_id is not null then
    v_order_id := nullif(v_result ->> 'orderId', '')::uuid;

    update public.orders
    set created_by_employee_id = p_created_by_employee_id
    where id = v_order_id
      and created_by_employee_id is distinct from p_created_by_employee_id;
  end if;

  return v_result || jsonb_build_object(
    'createdByEmployeeId',
    p_created_by_employee_id
  );
end;
$$;

grant execute on function public.create_invoice_with_items_safe(
  text,
  text,
  text,
  text,
  numeric,
  numeric,
  text,
  jsonb,
  text,
  uuid
) to authenticated, service_role;

commit;
