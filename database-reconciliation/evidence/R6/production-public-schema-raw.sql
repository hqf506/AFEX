--
-- PostgreSQL database dump
--

\restrict AUx91LP4esqDw4R3OZJiJaEqysBwIKkhlv9Le8b6fBiigbdRzjlzNMsE1Po9EWo

-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.4

-- Started on 2026-07-22 00:51:41

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 17 (class 2615 OID 2200)
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA public;


ALTER SCHEMA public OWNER TO pg_database_owner;

--
-- TOC entry 4466 (class 0 OID 0)
-- Dependencies: 17
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- TOC entry 517 (class 1255 OID 17596)
-- Name: adjust_inventory_stock(uuid, uuid, uuid, numeric, text, text, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.adjust_inventory_stock(p_tenant_id uuid, p_branch_id uuid, p_catalog_item_id uuid, p_quantity_delta numeric, p_movement_type text, p_notes text, p_created_by uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if p_created_by is null then
    raise exception 'created_by is required';
  end if;

  if not exists (
    select 1
    from public.branches b
    where b.id = p_branch_id
      and b.tenant_id = p_tenant_id
  ) then
    raise exception 'invalid branch for tenant';
  end if;

  if not exists (
    select 1
    from public.catalog_items ci
    where ci.id = p_catalog_item_id
      and ci.tenant_id = p_tenant_id
      and ci.track_inventory = true
  ) then
    raise exception 'invalid tracked catalog item for tenant';
  end if;

  insert into public.inventory_stock (
    tenant_id,
    branch_id,
    catalog_item_id,
    quantity_on_hand,
    low_stock_threshold
  )
  values (
    p_tenant_id,
    p_branch_id,
    p_catalog_item_id,
    0,
    0
  )
  on conflict (tenant_id, branch_id, catalog_item_id)
  do nothing;

  update public.inventory_stock s
  set
    quantity_on_hand = s.quantity_on_hand + p_quantity_delta,
    updated_at = now()
  where s.tenant_id = p_tenant_id
    and s.branch_id = p_branch_id
    and s.catalog_item_id = p_catalog_item_id;

  insert into public.inventory_movements (
    tenant_id,
    branch_id,
    catalog_item_id,
    movement_type,
    quantity_delta,
    source_type,
    source_id,
    notes,
    created_by
  )
  values (
    p_tenant_id,
    p_branch_id,
    p_catalog_item_id,
    p_movement_type,
    p_quantity_delta,
    'manual',
    null,
    p_notes,
    p_created_by
  );
end;
$$;


ALTER FUNCTION public.adjust_inventory_stock(p_tenant_id uuid, p_branch_id uuid, p_catalog_item_id uuid, p_quantity_delta numeric, p_movement_type text, p_notes text, p_created_by uuid) OWNER TO postgres;

--
-- TOC entry 518 (class 1255 OID 17597)
-- Name: afex_can_pos(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.afex_can_pos(p_role text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $$
  select p_role in (
    'owner',
    'admin',
    'manager',
    'employee',
    'cashier'
  )
$$;


ALTER FUNCTION public.afex_can_pos(p_role text) OWNER TO postgres;

--
-- TOC entry 519 (class 1255 OID 17598)
-- Name: afex_is_employee(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.afex_is_employee(p_role text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $$
  select p_role = 'employee'
$$;


ALTER FUNCTION public.afex_is_employee(p_role text) OWNER TO postgres;

--
-- TOC entry 520 (class 1255 OID 17599)
-- Name: afex_is_full_admin(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.afex_is_full_admin(p_role text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $$
  select p_role in ('owner', 'admin', 'manager')
$$;


ALTER FUNCTION public.afex_is_full_admin(p_role text) OWNER TO postgres;

--
-- TOC entry 521 (class 1255 OID 17600)
-- Name: create_invoice_with_items(jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_invoice_with_items(p_invoice jsonb, p_items jsonb) RETURNS uuid
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_invoice_id uuid;
  v_item jsonb;
  v_catalog_item record;
  v_valid_count int := 0;
BEGIN

  -- إنشاء الفاتورة
  INSERT INTO invoices (
    customer_id,
    branch_id,
    total_amount,
    payment_method,
    notes
  )
  VALUES (
    (p_invoice->>'customer_id')::uuid,
    (p_invoice->>'branch_id')::uuid,
    (p_invoice->>'total_amount')::numeric,
    p_invoice->>'payment_method',
    p_invoice->>'notes'
  )
  RETURNING id INTO v_invoice_id;

  -- إدخال العناصر
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP

    -- تحقق من وجود العنصر في الكتالوج
    SELECT * INTO v_catalog_item
    FROM catalog_items
    WHERE id = (v_item->>'item_id')::uuid;

    IF v_catalog_item.id IS NOT NULL THEN

      v_valid_count := v_valid_count + 1;

      INSERT INTO invoice_items (
        invoice_id,
        item_id,
        quantity,
        unit_price,
        cost_price
      )
      VALUES (
        v_invoice_id,
        v_catalog_item.id,
        (v_item->>'quantity')::int,
        (v_item->>'unit_price')::numeric,
        COALESCE(v_catalog_item.cost_price, 0)
      );

    END IF;

  END LOOP;

  -- إذا ما فيه عناصر صالحة
  IF v_valid_count = 0 THEN
    RAISE EXCEPTION 'NO_VALID_ITEMS';
  END IF;

  RETURN v_invoice_id;

END;
$$;


ALTER FUNCTION public.create_invoice_with_items(p_invoice jsonb, p_items jsonb) OWNER TO postgres;

--
-- TOC entry 522 (class 1255 OID 17601)
-- Name: create_invoice_with_items(text, text, text, text, numeric, numeric, text, json); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_invoice_with_items(p_customer_name text, p_customer_phone text, p_customer_notes text DEFAULT ''::text, p_payment_method text DEFAULT 'cash'::text, p_discount numeric DEFAULT 0, p_tax numeric DEFAULT 0, p_note text DEFAULT ''::text, p_items json DEFAULT '[]'::json) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  return public.create_invoice_with_items_safe(
    p_customer_name,
    p_customer_phone,
    p_customer_notes,
    p_payment_method,
    p_discount,
    p_tax,
    p_note,
    p_items::jsonb
  );
end;
$$;


ALTER FUNCTION public.create_invoice_with_items(p_customer_name text, p_customer_phone text, p_customer_notes text, p_payment_method text, p_discount numeric, p_tax numeric, p_note text, p_items json) OWNER TO postgres;

--
-- TOC entry 523 (class 1255 OID 17602)
-- Name: create_invoice_with_items(text, text, text, text, numeric, numeric, text, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_invoice_with_items(p_customer_name text, p_customer_phone text, p_customer_notes text DEFAULT ''::text, p_payment_method text DEFAULT 'cash'::text, p_discount numeric DEFAULT 0, p_tax numeric DEFAULT 0, p_note text DEFAULT ''::text, p_items jsonb DEFAULT '[]'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  return public.create_invoice_with_items_safe(
    p_customer_name,
    p_customer_phone,
    p_customer_notes,
    p_payment_method,
    p_discount,
    p_tax,
    p_note,
    p_items
  );
end;
$$;


ALTER FUNCTION public.create_invoice_with_items(p_customer_name text, p_customer_phone text, p_customer_notes text, p_payment_method text, p_discount numeric, p_tax numeric, p_note text, p_items jsonb) OWNER TO postgres;

--
-- TOC entry 524 (class 1255 OID 17603)
-- Name: create_invoice_with_items_safe(text, text, text, text, numeric, numeric, text, jsonb, text, uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_invoice_with_items_safe(p_customer_name text, p_customer_phone text, p_customer_notes text DEFAULT ''::text, p_payment_method text DEFAULT 'cash'::text, p_discount numeric DEFAULT 0, p_tax numeric DEFAULT 0, p_note text DEFAULT ''::text, p_items jsonb DEFAULT '[]'::jsonb, p_client_idempotency_key text DEFAULT ''::text, p_created_by_employee_id uuid DEFAULT NULL::uuid, p_tenant_id uuid DEFAULT NULL::uuid, p_branch_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  v_customer_id uuid;
  v_existing_customer_name text;
  v_order_id uuid;
  v_invoice_id uuid;
  v_order_number text;
  v_invoice_number text;
  v_status text := 'in_progress';
  v_subtotal numeric := 0;
  v_discount numeric := greatest(coalesce(p_discount, 0), 0);
  v_tax_total numeric := greatest(coalesce(p_tax, 0), 0);
  v_taxable_base numeric := 0;
  v_total numeric := 0;

  v_payment_status text := case
    when coalesce(nullif(trim(p_payment_method), ''), 'cash') = 'transfer'
      then 'pending'
    else 'paid'
  end;

  v_valid_items jsonb := '[]'::jsonb;
  v_valid_items_count integer := 0;

  v_customer_name text := trim(coalesce(p_customer_name, ''));
  v_customer_phone text := trim(coalesce(p_customer_phone, ''));
  v_note text := trim(coalesce(p_note, ''));

  v_client_idempotency_key text := nullif(trim(coalesce(p_client_idempotency_key, '')), '');

  v_tenant_id uuid := p_tenant_id;
  v_branch_id uuid;

  v_order_tenant_id uuid;
  v_invoice_tenant_id uuid;
begin

  if v_tenant_id is null then
    select tenant_id
    into v_tenant_id
    from public.profiles
    where id = auth.uid()
    limit 1;
  end if;

  if v_tenant_id is null then
    v_tenant_id := public.resolve_default_tenant_id();
  end if;

  if p_branch_id is not null then
    select b.id
    into v_branch_id
    from public.branches b
    where b.id = p_branch_id
      and b.tenant_id = v_tenant_id
    limit 1;

    if v_branch_id is null then
      raise exception 'Invalid branch_id for tenant'
        using errcode = '23514';
    end if;
  end if;

  if v_branch_id is null and p_created_by_employee_id is not null then
    select p.branch_id
    into v_branch_id
    from public.profiles p
    join public.branches b
      on b.id = p.branch_id
    where p.id = p_created_by_employee_id
      and p.tenant_id = v_tenant_id
      and b.tenant_id = v_tenant_id
    limit 1;
  end if;

  if v_branch_id is null then
    v_branch_id := public.resolve_insert_branch_id(null);
  end if;

  with normalized_items as (
    select
      parsed.line_no,
      ci.id as item_id,

      coalesce(
        nullif(trim(parsed.item_name), ''),
        ci.name
      ) as item_name_snapshot,

      case
        when lower(
          coalesce(
            nullif(trim(parsed.item_type), ''),
            ci.item_type
          )
        ) = 'service'
        then 'service'
        else 'product'
      end as item_type_snapshot,

      greatest(coalesce(parsed.quantity, 0), 0) as quantity,

      greatest(
        coalesce(parsed.unit_price, ci.default_price, 0),
        0
      ) as unit_price,

      greatest(coalesce(ci.cost_price, 0), 0) as cost_price

    from (
      select
        source.ordinality as line_no,

        case
          when trim(coalesce(source.item ->> 'item_id', ''))
            ~* '^[0-9a-f-]{36}$'
          then trim(source.item ->> 'item_id')::uuid
          else null
        end as item_id,

        source.item ->> 'item_name' as item_name,
        source.item ->> 'item_type' as item_type,

        case
          when coalesce(source.item ->> 'quantity', '')
            ~ '^-?[0-9]+(\.[0-9]+)?$'
          then (source.item ->> 'quantity')::numeric
          else null
        end as quantity,

        case
          when coalesce(source.item ->> 'unit_price', '')
            ~ '^-?[0-9]+(\.[0-9]+)?$'
          then (source.item ->> 'unit_price')::numeric
          else null
        end as unit_price

      from jsonb_array_elements(
        coalesce(p_items, '[]'::jsonb)
      ) with ordinality as source(item, ordinality)

    ) as parsed

    join public.catalog_items ci
      on ci.id = parsed.item_id
  ),

  validated_items as (
    select
      line_no,
      item_id,
      item_name_snapshot,
      item_type_snapshot,
      quantity,
      unit_price,
      cost_price,
      quantity * unit_price as line_total
    from normalized_items
    where quantity > 0
  )

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'item_id', item_id,
          'item_name_snapshot', item_name_snapshot,
          'item_type_snapshot', item_type_snapshot,
          'quantity', quantity,
          'unit_price', unit_price,
          'line_total', line_total,
          'cost_price', cost_price
        )
        order by line_no
      ),
      '[]'::jsonb
    ),

    count(*),

    coalesce(sum(line_total), 0)

  into
    v_valid_items,
    v_valid_items_count,
    v_subtotal

  from validated_items;

  if v_valid_items_count = 0 then
    raise exception 'No valid items were provided for invoice creation';
  end if;

  v_taxable_base := greatest(v_subtotal - v_discount, 0);
  v_total := v_taxable_base + v_tax_total;

  if v_customer_phone <> '' then
    select
      id,
      name
    into
      v_customer_id,
      v_existing_customer_name
    from public.customers
    where phone = v_customer_phone
    limit 1;
  end if;

  if v_customer_id is null then

    insert into public.customers (
      name,
      phone,
      branch_id,
      tenant_id
    )
    values (
      nullif(v_customer_name, ''),
      nullif(v_customer_phone, ''),
      v_branch_id,
      v_tenant_id
    )
    returning id into v_customer_id;

  elsif v_customer_name <> ''
    and coalesce(trim(v_existing_customer_name), '') = '' then

    update public.customers
    set name = v_customer_name
    where id = v_customer_id;

  end if;

  insert into public.orders (
    customer_id,
    status,
    client_idempotency_key,
    created_by_employee_id,
    branch_id,
    tenant_id
  )
  values (
    v_customer_id,
    v_status,
    v_client_idempotency_key,
    p_created_by_employee_id,
    v_branch_id,
    v_tenant_id
  )
  returning
    id,
    tenant_id
  into
    v_order_id,
    v_order_tenant_id;

  insert into public.invoices (
    order_id,
    customer_id,
    payment_method,
    payment_status,
    note,
    subtotal,
    discount,
    tax,
    total,
    branch_id,
    tenant_id
  )
  values (
    v_order_id,
    v_customer_id,
    coalesce(nullif(trim(p_payment_method), ''), 'cash'),
    v_payment_status,
    nullif(v_note, ''),
    v_subtotal,
    v_discount,
    v_tax_total,
    v_total,
    v_branch_id,
    v_order_tenant_id
  )
  returning
    id,
    invoice_number,
    tenant_id
  into
    v_invoice_id,
    v_invoice_number,
    v_invoice_tenant_id;

  insert into public.invoice_items (
    invoice_id,
    item_id,
    item_name_snapshot,
    item_type_snapshot,
    quantity,
    unit_price,
    line_total,
    cost_price,
    tenant_id
  )
  select
    v_invoice_id,
    nullif(item ->> 'item_id', '')::uuid,
    item ->> 'item_name_snapshot',
    item ->> 'item_type_snapshot',
    (item ->> 'quantity')::numeric,
    (item ->> 'unit_price')::numeric,
    (item ->> 'line_total')::numeric,
    coalesce((item ->> 'cost_price')::numeric, 0),
    v_invoice_tenant_id
  from jsonb_array_elements(v_valid_items) as item;

  select order_number
  into v_order_number
  from public.orders
  where id = v_order_id;

  return jsonb_build_object(
    'orderId', v_order_id,
    'orderNumber', v_order_number,
    'invoiceId', v_invoice_id,
    'invoiceNumber', v_invoice_number,
    'customerId', v_customer_id,
    'status', v_status,
    'subtotal', v_subtotal,
    'discount', v_discount,
    'tax', v_tax_total,
    'total', v_total,
    'itemsCount', v_valid_items_count,
    'clientIdempotencyKey', v_client_idempotency_key,
    'createdByEmployeeId', p_created_by_employee_id,
    'tenantId', v_order_tenant_id
  );

end;
$_$;


ALTER FUNCTION public.create_invoice_with_items_safe(p_customer_name text, p_customer_phone text, p_customer_notes text, p_payment_method text, p_discount numeric, p_tax numeric, p_note text, p_items jsonb, p_client_idempotency_key text, p_created_by_employee_id uuid, p_tenant_id uuid, p_branch_id uuid) OWNER TO postgres;

--
-- TOC entry 557 (class 1255 OID 18520)
-- Name: create_support_ticket_atomic(uuid, uuid, uuid, text, text, text, text, text, text, text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_support_ticket_atomic(p_tenant_id uuid, p_branch_id uuid, p_created_by uuid, p_category text, p_priority text, p_title text, p_description text, p_source text, p_page_path text, p_error_reference text, p_error_code text, p_safe_error_message text, p_diagnostic_context jsonb) RETURNS TABLE(id uuid, ticket_number text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_ticket public.support_tickets;
  v_ticket_sequence_number bigint;
  v_ticket_number text;
  v_title text := trim(coalesce(p_title, ''));
  v_description text := trim(coalesce(p_description, ''));
  v_diagnostic_context jsonb := coalesce(p_diagnostic_context, '{}'::jsonb);
begin
  if p_tenant_id is null or not exists (
    select 1
    from public.tenants
    where public.tenants.id = p_tenant_id
  ) then
    raise exception using errcode = '22023', message = 'Invalid support tenant';
  end if;

  if p_created_by is null or not exists (
    select 1
    from public.profiles
    where public.profiles.id = p_created_by
      and public.profiles.tenant_id = p_tenant_id
      and public.profiles.is_active
  ) then
    raise exception using errcode = '42501', message = 'Invalid support ticket creator';
  end if;

  if p_branch_id is not null and not exists (
    select 1
    from public.branches
    where public.branches.id = p_branch_id
      and public.branches.tenant_id = p_tenant_id
      and public.branches.deleted_at is null
  ) then
    raise exception using errcode = '22023', message = 'Invalid support branch';
  end if;

  if v_title = '' or char_length(v_title) > 180 then
    raise exception using errcode = '22023', message = 'Invalid support title';
  end if;

  if v_description = '' or char_length(v_description) > 5000 then
    raise exception using errcode = '22023', message = 'Invalid support description';
  end if;

  if octet_length(v_diagnostic_context::text) > 8192 then
    raise exception using errcode = '22023', message = 'Support diagnostics are too large';
  end if;

  if p_category is null or p_category not in (
    'technical_error',
    'orders',
    'inventory',
    'invoices',
    'whatsapp',
    'printing',
    'users_permissions',
    'performance',
    'feature_request',
    'other'
  ) then
    raise exception using errcode = '22023', message = 'Invalid support category';
  end if;

  if p_priority is null or p_priority not in (
    'low',
    'normal',
    'high',
    'critical'
  ) then
    raise exception using errcode = '22023', message = 'Invalid support priority';
  end if;

  if p_source is null or p_source not in (
    'manual',
    'error_report',
    'system'
  ) then
    raise exception using errcode = '22023', message = 'Invalid support source';
  end if;

  if p_page_path is not null and char_length(p_page_path) > 300 then
    raise exception using errcode = '22023', message = 'Invalid support page path';
  end if;

  if p_error_reference is not null and char_length(p_error_reference) > 100 then
    raise exception using errcode = '22023', message = 'Invalid support error reference';
  end if;

  if p_error_code is not null and char_length(p_error_code) > 100 then
    raise exception using errcode = '22023', message = 'Invalid support error code';
  end if;

  if p_safe_error_message is not null and char_length(p_safe_error_message) > 500 then
    raise exception using errcode = '22023', message = 'Invalid safe support message';
  end if;

  v_ticket_sequence_number := nextval('public.support_ticket_number_seq');
  v_ticket_number :=
    'SUP-'
    || to_char(now(), 'YYYYMM')
    || '-'
    || lpad(v_ticket_sequence_number::text, 6, '0');

  insert into public.support_tickets (
    ticket_number,
    tenant_id,
    branch_id,
    created_by,
    category,
    priority,
    title,
    description,
    source,
    page_path,
    error_reference,
    error_code,
    safe_error_message,
    diagnostic_context
  )
  values (
    v_ticket_number,
    p_tenant_id,
    p_branch_id,
    p_created_by,
    p_category,
    p_priority,
    v_title,
    v_description,
    p_source,
    nullif(trim(coalesce(p_page_path, '')), ''),
    nullif(trim(coalesce(p_error_reference, '')), ''),
    nullif(trim(coalesce(p_error_code, '')), ''),
    nullif(trim(coalesce(p_safe_error_message, '')), ''),
    v_diagnostic_context
  )
  returning * into v_ticket;

  insert into public.support_messages (
    ticket_id,
    sender_id,
    sender_type,
    message,
    is_internal
  )
  values (
    v_ticket.id,
    p_created_by,
    'customer',
    v_description,
    false
  );

  insert into public.support_ticket_events (
    ticket_id,
    actor_id,
    event_type,
    previous_value,
    new_value
  )
  values (
    v_ticket.id,
    p_created_by,
    'ticket_created',
    null,
    jsonb_build_object(
      'status',
      'new',
      'priority',
      p_priority,
      'category',
      p_category
    )
  );

  return query
  select v_ticket.id, v_ticket.ticket_number;
end;
$$;


ALTER FUNCTION public.create_support_ticket_atomic(p_tenant_id uuid, p_branch_id uuid, p_created_by uuid, p_category text, p_priority text, p_title text, p_description text, p_source text, p_page_path text, p_error_reference text, p_error_code text, p_safe_error_message text, p_diagnostic_context jsonb) OWNER TO postgres;

--
-- TOC entry 525 (class 1255 OID 17605)
-- Name: create_tenant_with_owner(text, uuid, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_tenant_with_owner(p_tenant_name text, p_owner_user_id uuid, p_owner_username text, p_owner_full_name text DEFAULT NULL::text, p_owner_contact_email text DEFAULT NULL::text, p_owner_phone text DEFAULT NULL::text, p_default_branch_name text DEFAULT 'Main Branch'::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tenant_id uuid;
  v_branch_id uuid := gen_random_uuid();
  v_branch_code text;
  v_tenant_name text := nullif(trim(coalesce(p_tenant_name, '')), '');
  v_owner_username text := lower(nullif(trim(coalesce(p_owner_username, '')), ''));
  v_owner_full_name text := nullif(trim(coalesce(p_owner_full_name, '')), '');
  v_owner_contact_email text := lower(nullif(trim(coalesce(p_owner_contact_email, '')), ''));
  v_owner_phone text := nullif(trim(coalesce(p_owner_phone, '')), '');
  v_default_branch_name text := nullif(trim(coalesce(p_default_branch_name, '')), '');
begin
  if v_tenant_name is null then
    raise exception 'Tenant name is required' using errcode = '23502';
  end if;

  if p_owner_user_id is null then
    raise exception 'Owner user id is required' using errcode = '23502';
  end if;

  if v_owner_username is null then
    raise exception 'Owner username is required' using errcode = '23502';
  end if;

  insert into public.tenants (name)
  values (v_tenant_name)
  returning id into v_tenant_id;

  v_branch_code := 'branch-' || left(replace(v_branch_id::text, '-', ''), 8);

  insert into public.branches (
    id,
    code,
    name,
    is_active,
    tenant_id,
    order_number_prefix
  )
  values (
    v_branch_id,
    v_branch_code,
    coalesce(v_default_branch_name, 'Main Branch'),
    true,
    v_tenant_id,
    '01'
  );

  insert into public.profiles (
    id,
    username,
    full_name,
    contact_email,
    phone,
    role,
    is_active,
    tenant_id,
    branch_id
  )
  values (
    p_owner_user_id,
    v_owner_username,
    coalesce(v_owner_full_name, v_owner_username),
    v_owner_contact_email,
    v_owner_phone,
    'admin',
    true,
    v_tenant_id,
    v_branch_id
  )
  on conflict (id) do update
  set
    username = excluded.username,
    full_name = excluded.full_name,
    contact_email = excluded.contact_email,
    phone = excluded.phone,
    role = excluded.role,
    is_active = excluded.is_active,
    tenant_id = excluded.tenant_id,
    branch_id = excluded.branch_id;

  return jsonb_build_object(
    'tenantId', v_tenant_id,
    'tenant_id', v_tenant_id,
    'ownerId', p_owner_user_id,
    'owner_id', p_owner_user_id,
    'userId', p_owner_user_id,
    'branchId', v_branch_id,
    'branch_id', v_branch_id,
    'orderNumberPrefix', '01',
    'order_number_prefix', '01'
  );
end;
$$;


ALTER FUNCTION public.create_tenant_with_owner(p_tenant_name text, p_owner_user_id uuid, p_owner_username text, p_owner_full_name text, p_owner_contact_email text, p_owner_phone text, p_default_branch_name text) OWNER TO postgres;

--
-- TOC entry 526 (class 1255 OID 17606)
-- Name: create_tenant_with_owner(text, uuid, text, text, text, text, text, text, numeric, boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.create_tenant_with_owner(p_tenant_name text, p_owner_user_id uuid, p_owner_username text, p_owner_full_name text, p_owner_contact_email text DEFAULT NULL::text, p_owner_phone text DEFAULT NULL::text, p_default_branch_code text DEFAULT 'main'::text, p_default_branch_name text DEFAULT 'الفرع الرئيسي'::text, p_vat_rate numeric DEFAULT 15, p_vat_active boolean DEFAULT true) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tenant_id uuid;
  v_branch_id uuid;
begin
  insert into public.tenants (name)
  values (trim(p_tenant_name))
  returning id into v_tenant_id;

  insert into public.branches (code, name, is_active, tenant_id)
  values (
    lower(trim(p_default_branch_code)),
    trim(p_default_branch_name),
    true,
    v_tenant_id
  )
  returning id into v_branch_id;

  insert into public.profiles (
    id,
    username,
    full_name,
    role,
    is_active,
    branch_id,
    contact_email,
    phone,
    tenant_id
  )
  values (
    p_owner_user_id,
    lower(trim(p_owner_username)),
    coalesce(nullif(trim(p_owner_full_name), ''), lower(trim(p_owner_username))),
    'admin',
    true,
    null,
    nullif(trim(p_owner_contact_email), ''),
    nullif(trim(p_owner_phone), ''),
    v_tenant_id
  );

  insert into public.system_settings (tenant_id)
  values (v_tenant_id);

  insert into public.vat_settings (
    name,
    rate,
    is_active,
    branch_id,
    tenant_id
  )
  values (
    'VAT',
    p_vat_rate,
    p_vat_active,
    null,
    v_tenant_id
  );

  return jsonb_build_object(
    'tenantId', v_tenant_id,
    'branchId', v_branch_id,
    'ownerId', p_owner_user_id
  );
end;
$$;


ALTER FUNCTION public.create_tenant_with_owner(p_tenant_name text, p_owner_user_id uuid, p_owner_username text, p_owner_full_name text, p_owner_contact_email text, p_owner_phone text, p_default_branch_code text, p_default_branch_name text, p_vat_rate numeric, p_vat_active boolean) OWNER TO postgres;

--
-- TOC entry 527 (class 1255 OID 17607)
-- Name: current_profile_role(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.current_profile_role() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select p.role::text
  from public.profiles p
  where p.id = auth.uid()
    and p.is_active = true
  limit 1;
$$;


ALTER FUNCTION public.current_profile_role() OWNER TO postgres;

--
-- TOC entry 528 (class 1255 OID 17608)
-- Name: current_profile_tenant_id(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.current_profile_tenant_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  select public.profiles.tenant_id
  from public.profiles
  where public.profiles.id = auth.uid()
    and public.profiles.is_active
  limit 1;
$$;


ALTER FUNCTION public.current_profile_tenant_id() OWNER TO postgres;

--
-- TOC entry 529 (class 1255 OID 17609)
-- Name: current_user_role(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.current_user_role() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  select role from public.profiles where id = auth.uid()
$$;


ALTER FUNCTION public.current_user_role() OWNER TO postgres;

--
-- TOC entry 530 (class 1255 OID 17610)
-- Name: deduct_inventory_on_invoice_item_insert(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.deduct_inventory_on_invoice_item_insert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  v_tenant_id uuid;
  v_branch_id uuid;
  v_item_type text;
  v_track_inventory boolean;
  v_is_composite boolean;
  v_stock numeric;
begin
  select
    i.tenant_id,
    i.branch_id
  into
    v_tenant_id,
    v_branch_id
  from public.invoices i
  where i.id = new.invoice_id;

  if v_tenant_id is null or v_branch_id is null then
    raise exception 'invoice scope missing for inventory deduction';
  end if;

  select
    ci.item_type::text,
    coalesce(ci.track_inventory, false),
    coalesce(ci.is_composite, false)
  into
    v_item_type,
    v_track_inventory,
    v_is_composite
  from public.catalog_items ci
  where ci.id = new.item_id
    and ci.tenant_id = v_tenant_id;

  if coalesce(v_track_inventory, false) = false then
    return new;
  end if;

  if not (v_item_type = 'product' or v_is_composite = true) then
    return new;
  end if;

  select s.quantity_on_hand
  into v_stock
  from public.inventory_stock s
  where s.tenant_id = v_tenant_id
    and s.branch_id = v_branch_id
    and s.catalog_item_id = new.item_id
  for update;

  if v_stock is null then
    raise exception 'INSUFFICIENT_STOCK: stock row not found';
  end if;

  if v_stock < new.quantity then
    raise exception 'INSUFFICIENT_STOCK: not enough stock';
  end if;

  update public.inventory_stock s
  set
    quantity_on_hand = s.quantity_on_hand - new.quantity,
    updated_at = now()
  where s.tenant_id = v_tenant_id
    and s.branch_id = v_branch_id
    and s.catalog_item_id = new.item_id;

  insert into public.inventory_movements (
    tenant_id,
    branch_id,
    catalog_item_id,
    movement_type,
    quantity_delta,
    source_type,
    source_id,
    notes,
    created_at
  )
  values (
    v_tenant_id,
    v_branch_id,
    new.item_id,
    'sale',
    -new.quantity,
    'invoice_item',
    new.id,
    'POS sale stock deduction',
    now()
  );

  return new;
end;
$$;


ALTER FUNCTION public.deduct_inventory_on_invoice_item_insert() OWNER TO postgres;

--
-- TOC entry 531 (class 1255 OID 17611)
-- Name: ensure_branch_order_number_prefix(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.ensure_branch_order_number_prefix(p_branch_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  v_tenant_id uuid;
  v_prefix text;
  v_next_prefix text;
begin
  select tenant_id, nullif(trim(coalesce(order_number_prefix, '')), '')
  into v_tenant_id, v_prefix
  from public.branches
  where id = p_branch_id
  limit 1;

  if v_prefix is not null then
    return v_prefix;
  end if;

  perform pg_advisory_xact_lock(hashtext('afex_branch_order_number_prefix'), hashtext(v_tenant_id::text));

  select lpad((coalesce(max(order_number_prefix::integer), 0) + 1)::text, 2, '0')
  into v_next_prefix
  from public.branches
  where tenant_id = v_tenant_id
    and order_number_prefix ~ '^[0-9]{2}$';

  update public.branches
  set order_number_prefix = v_next_prefix
  where id = p_branch_id;

  return v_next_prefix;
end;
$_$;


ALTER FUNCTION public.ensure_branch_order_number_prefix(p_branch_id uuid) OWNER TO postgres;

--
-- TOC entry 532 (class 1255 OID 17612)
-- Name: ensure_inventory_stock_for_catalog_item(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.ensure_inventory_stock_for_catalog_item(p_catalog_item_id uuid, p_tenant_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  if p_catalog_item_id is null then
    raise exception 'catalog item id is required';
  end if;

  if p_tenant_id is null then
    raise exception 'tenant id is required';
  end if;

  insert into public.inventory_stock (
    tenant_id,
    branch_id,
    catalog_item_id,
    quantity_on_hand,
    low_stock_threshold
  )
  select
    p_tenant_id,
    b.id,
    p_catalog_item_id,
    0,
    0
  from public.branches b
  where b.tenant_id = p_tenant_id
  on conflict (tenant_id, branch_id, catalog_item_id)
  do nothing;
end;
$$;


ALTER FUNCTION public.ensure_inventory_stock_for_catalog_item(p_catalog_item_id uuid, p_tenant_id uuid) OWNER TO postgres;

--
-- TOC entry 533 (class 1255 OID 17613)
-- Name: generate_invoice_number(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.generate_invoice_number() RETURNS text
    LANGUAGE plpgsql
    AS $$
declare
  next_number integer;
begin
  select nextval('public.invoice_number_seq') into next_number;
  return 'LF-' || lpad(next_number::text, 4, '0');
end;
$$;


ALTER FUNCTION public.generate_invoice_number() OWNER TO postgres;

--
-- TOC entry 534 (class 1255 OID 17614)
-- Name: generate_order_number(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.generate_order_number() RETURNS text
    LANGUAGE plpgsql
    AS $$
declare
  next_number integer;
begin
  select nextval('public.order_number_seq') into next_number;
  return 'LF-' || next_number::text;
end;
$$;


ALTER FUNCTION public.generate_order_number() OWNER TO postgres;

--
-- TOC entry 535 (class 1255 OID 17615)
-- Name: get_branch_inventory(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_branch_inventory(p_branch_id uuid, p_tenant_id uuid) RETURNS TABLE(catalog_item_id uuid, item_name text, item_type text, category text, quantity_on_hand numeric, low_stock_threshold numeric, is_low_stock boolean)
    LANGUAGE sql SECURITY DEFINER
    AS $$
  select
    ci.id as catalog_item_id,
    ci.name as item_name,
    ci.item_type::text as item_type,
    ci.category,
    coalesce(s.quantity_on_hand, 0) as quantity_on_hand,
    coalesce(s.low_stock_threshold, 0) as low_stock_threshold,
    (
      coalesce(s.low_stock_threshold, 0) > 0
      and coalesce(s.quantity_on_hand, 0) <= coalesce(s.low_stock_threshold, 0)
    ) as is_low_stock
  from public.catalog_items ci
  left join public.inventory_stock s
    on s.catalog_item_id = ci.id
   and s.tenant_id = p_tenant_id
   and s.branch_id = p_branch_id
  where ci.tenant_id = p_tenant_id
    and coalesce(ci.track_inventory, false) = true
  order by ci.name asc;
$$;


ALTER FUNCTION public.get_branch_inventory(p_branch_id uuid, p_tenant_id uuid) OWNER TO postgres;

--
-- TOC entry 560 (class 1255 OID 18675)
-- Name: get_developer_support_notifications(uuid, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_developer_support_notifications(p_provider_user_id uuid, p_limit integer DEFAULT 20) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_limit integer :=
    least(
      greatest(coalesce(p_limit, 20), 1),
      50
    );

  v_calculated_at timestamptz :=
    statement_timestamp();

  v_result jsonb;
begin
  with eligible_events as (
    select *
    from
      public
        .get_eligible_developer_support_notification_events(
          p_provider_user_id,
          v_calculated_at
        )
  ),

  annotated_events as (
    select
      eligible_events.*,

      not exists (
        select 1

        from
          public.support_developer_notification_reads

        where
          public.support_developer_notification_reads
            .user_id =
            p_provider_user_id

          and public
            .support_developer_notification_reads
            .event_type =
            eligible_events.event_type

          and public
            .support_developer_notification_reads
            .ticket_id =
            eligible_events.ticket_id

          and (
            (
              eligible_events.event_type =
                'ticket_created'

              and public
                .support_developer_notification_reads
                .message_id is null
            )

            or public
              .support_developer_notification_reads
              .message_id =
              eligible_events.message_id
          )
      )
        as unread

    from eligible_events
  ),

  limited_events as (
    select annotated_events.*

    from annotated_events

    order by
      annotated_events.activity_at desc,
      annotated_events.event_key desc

    limit v_limit
  )

  select jsonb_build_object(
    'items',

    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'event_type',
              limited_events.event_type,

            'event_key',
              limited_events.event_key,

            'event_id',
              limited_events.event_id,

            'ticket_id',
              limited_events.ticket_id,

            'ticket_number',
              limited_events.ticket_number,

            'title',
              limited_events.title,

            'organization_name',
              coalesce(
                limited_events.organization_name,
                'منشأة عميل'
              ),

            'activity_at',
              limited_events.activity_at,

            'preview',
              limited_events.preview,

            'unread',
              limited_events.unread
          )

          order by
            limited_events.activity_at desc,
            limited_events.event_key desc
        )

        from limited_events
      ),

      '[]'::jsonb
    ),

    'unread_count',

    (
      select count(*)
      from annotated_events
      where annotated_events.unread
    ),

    'calculated_at',
      v_calculated_at
  )
  into v_result;

  return v_result;
end;
$$;


ALTER FUNCTION public.get_developer_support_notifications(p_provider_user_id uuid, p_limit integer) OWNER TO postgres;

--
-- TOC entry 4488 (class 0 OID 0)
-- Dependencies: 560
-- Name: FUNCTION get_developer_support_notifications(p_provider_user_id uuid, p_limit integer); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.get_developer_support_notifications(p_provider_user_id uuid, p_limit integer) IS 'Service-role-only bounded notification feed. Eligibility is provided exclusively by get_eligible_developer_support_notification_events.';


--
-- TOC entry 559 (class 1255 OID 18674)
-- Name: get_eligible_developer_support_notification_events(uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_eligible_developer_support_notification_events(p_provider_user_id uuid, p_through timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE(event_type text, event_key text, event_id uuid, ticket_id uuid, message_id uuid, ticket_number text, title text, organization_name text, activity_at timestamp with time zone, preview text)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  if p_provider_user_id is null
    or not exists (
      select 1
      from public.platform_admins
      where public.platform_admins.user_id =
        p_provider_user_id
        and public.platform_admins.is_active
        and public.platform_admins.role =
          'provider_owner'
    )
  then
    raise exception using
      errcode = '42501',
      message =
        'Active provider owner access required';
  end if;

  return query

  select
    'ticket_created'::text
      as event_type,

    (
      'ticket:'
      || public.support_tickets.id::text
    )
      as event_key,

    public.support_tickets.id
      as event_id,

    public.support_tickets.id
      as ticket_id,

    null::uuid
      as message_id,

    public.support_tickets.ticket_number,

    public.support_tickets.title,

    public.tenants.name
      as organization_name,

    public.support_tickets.created_at
      as activity_at,

    null::text
      as preview

  from public.support_tickets

  join public.tenants
    on public.tenants.id =
      public.support_tickets.tenant_id

  where (
      p_through is null
      or public.support_tickets.created_at <=
        p_through
    )

    and public.support_tickets.created_by is distinct from
      p_provider_user_id

  union all

  select
    'customer_reply'::text
      as event_type,

    (
      'message:'
      || public.support_messages.id::text
    )
      as event_key,

    public.support_messages.id
      as event_id,

    public.support_tickets.id
      as ticket_id,

    public.support_messages.id
      as message_id,

    public.support_tickets.ticket_number,

    public.support_tickets.title,

    public.tenants.name
      as organization_name,

    public.support_messages.created_at
      as activity_at,

    left(
      regexp_replace(
        coalesce(
          public.support_messages.message,
          ''
        ),
        '[[:space:]]+',
        ' ',
        'g'
      ),
      240
    )
      as preview

  from public.support_messages

  join public.support_tickets
    on public.support_tickets.id =
      public.support_messages.ticket_id

  join public.tenants
    on public.tenants.id =
      public.support_tickets.tenant_id

  where public.support_messages.sender_type =
      'customer'

    and public.support_messages.is_internal = false

    and (
      p_through is null
      or public.support_messages.created_at <=
        p_through
    )

    and public.support_messages.sender_id is distinct from
      p_provider_user_id;
end;
$$;


ALTER FUNCTION public.get_eligible_developer_support_notification_events(p_provider_user_id uuid, p_through timestamp with time zone) OWNER TO postgres;

--
-- TOC entry 4490 (class 0 OID 0)
-- Dependencies: 559
-- Name: FUNCTION get_eligible_developer_support_notification_events(p_provider_user_id uuid, p_through timestamp with time zone); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.get_eligible_developer_support_notification_events(p_provider_user_id uuid, p_through timestamp with time zone) IS 'Internal service-role-only source of eligible Developer support notifications. It validates an active provider_owner and returns only ticket-created and public customer-reply events.';


--
-- TOC entry 558 (class 1255 OID 18536)
-- Name: get_provider_support_operational_dashboard(uuid, integer, integer, text, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.get_provider_support_operational_dashboard(p_provider_user_id uuid, p_page integer DEFAULT 1, p_page_size integer DEFAULT 25, p_search text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_priority text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_organization text DEFAULT NULL::text, p_assignment text DEFAULT 'all'::text, p_operational_filter text DEFAULT 'all'::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_provider_user_id uuid := p_provider_user_id;
  v_now timestamptz := statement_timestamp();

  v_page integer :=
    greatest(coalesce(p_page, 1), 1);

  v_page_size integer :=
    least(
      greatest(coalesce(p_page_size, 25), 1),
      100
    );

  v_search text :=
    nullif(trim(coalesce(p_search, '')), '');

  v_organization text :=
    nullif(trim(coalesce(p_organization, '')), '');

  v_status_scope text :=
    coalesce(nullif(trim(p_status), ''), 'all');

  v_assignment text :=
    coalesce(nullif(trim(p_assignment), ''), 'all');

  v_operational_filter text :=
    coalesce(
      nullif(trim(p_operational_filter), ''),
      'all'
    );

  v_result jsonb;
begin
  if v_provider_user_id is null
    or not exists (
      select 1
      from public.platform_admins
      where public.platform_admins.user_id =
        v_provider_user_id
        and public.platform_admins.is_active
    )
  then
    raise exception using
      errcode = '42501',
      message = 'Active provider access required';
  end if;

  if v_status_scope not in (
    'all',
    'active',
    'new',
    'investigating',
    'waiting_customer',
    'resolved',
    'closed'
  )
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid support status scope';
  end if;

  if p_priority is not null
    and p_priority not in (
      'low',
      'normal',
      'high',
      'critical'
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid support priority filter';
  end if;

  if p_category is not null
    and p_category not in (
      'technical_error',
      'orders',
      'inventory',
      'invoices',
      'whatsapp',
      'printing',
      'users_permissions',
      'performance',
      'feature_request',
      'other'
    )
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid support category filter';
  end if;

  if v_assignment not in (
    'all',
    'me',
    'unassigned',
    'assigned'
  )
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid support assignment filter';
  end if;

  if v_operational_filter not in (
    'all',
    'awaiting_first_response',
    'needs_follow_up',
    'attention',
    'overdue',
    'waiting_customer'
  )
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid support operational filter';
  end if;

  with
  public_message_metrics as (
    select
      public.support_messages.ticket_id,

      min(public.support_messages.created_at)
        filter (
          where public.support_messages.sender_type =
            'provider'
        )
        as first_provider_reply_at,

      max(public.support_messages.created_at)
        filter (
          where public.support_messages.sender_type =
            'customer'
        )
        as last_customer_message_at,

      max(public.support_messages.created_at)
        filter (
          where public.support_messages.sender_type =
            'provider'
        )
        as last_provider_reply_at,

      max(public.support_messages.created_at)
        as last_public_message_at,

      (
        array_agg(
          public.support_messages.sender_type
          order by
            public.support_messages.created_at desc,
            public.support_messages.id desc
        )
      )[1]
        as last_public_sender_type,

      (
        array_agg(
          public.support_messages.sender_type
          order by
            public.support_messages.created_at desc,
            public.support_messages.id desc
        )
        filter (
          where public.support_messages.sender_type
            in ('customer', 'provider')
        )
      )[1]
        as last_conversation_sender_type,

      count(*)::bigint
        as public_message_count

    from public.support_messages

    where public.support_messages.is_internal = false

    group by public.support_messages.ticket_id
  ),

  metric_rows as (
    select
      public.support_tickets.id,
      public.support_tickets.ticket_number,
      public.support_tickets.category,
      public.support_tickets.priority,
      public.support_tickets.status,
      public.support_tickets.title,
      public.support_tickets.assigned_to,
      public.support_tickets.created_at,
      public.support_tickets.updated_at,
      public.support_tickets.resolved_at,
      public.support_tickets.closed_at,

      public.tenants.name
        as organization_name,

      public_message_metrics.first_provider_reply_at,
      public_message_metrics.last_customer_message_at,
      public_message_metrics.last_provider_reply_at,
      public_message_metrics.last_public_message_at,
      public_message_metrics.last_public_sender_type,
      public_message_metrics.last_conversation_sender_type,

      coalesce(
        public_message_metrics.public_message_count,
        0
      )::bigint
        as public_message_count,

      case public.support_tickets.priority
        when 'critical' then 30
        when 'high' then 120
        when 'normal' then 480
        when 'low' then 1440
      end::integer
        as first_response_threshold_minutes,

      case public.support_tickets.priority
        when 'critical' then 60
        when 'high' then 240
        when 'normal' then 1440
        when 'low' then 2880
      end::integer
        as follow_up_threshold_minutes

    from public.support_tickets

    join public.tenants
      on public.tenants.id =
        public.support_tickets.tenant_id

    left join public_message_metrics
      on public_message_metrics.ticket_id =
        public.support_tickets.id
  ),

  timed_rows as (
    select
      metric_rows.*,

      greatest(
        0,
        floor(
          extract(
            epoch from (
              v_now - metric_rows.created_at
            )
          ) / 60
        )
      )::bigint
        as age_minutes,

      case
        when metric_rows.first_provider_reply_at is null
          then null

        else greatest(
          0,
          floor(
            extract(
              epoch from (
                metric_rows.first_provider_reply_at
                - metric_rows.created_at
              )
            ) / 60
          )
        )::bigint
      end
        as first_response_minutes,

      case
        when metric_rows.status in (
          'resolved',
          'closed'
        )
          then null

        when metric_rows.first_provider_reply_at is null
          then greatest(
            0,
            floor(
              extract(
                epoch from (
                  v_now - metric_rows.created_at
                )
              ) / 60
            )
          )::bigint

        when metric_rows.last_conversation_sender_type =
          'customer'
          and metric_rows.last_customer_message_at
            is not null
          then greatest(
            0,
            floor(
              extract(
                epoch from (
                  v_now
                  - metric_rows.last_customer_message_at
                )
              ) / 60
            )
          )::bigint

        when metric_rows.last_conversation_sender_type =
          'provider'
          and metric_rows.last_provider_reply_at
            is not null
          then greatest(
            0,
            floor(
              extract(
                epoch from (
                  v_now
                  - metric_rows.last_provider_reply_at
                )
              ) / 60
            )
          )::bigint

        else null
      end
        as waiting_minutes,

      case
        when metric_rows.status in (
          'resolved',
          'closed'
        )
          then null

        when metric_rows.first_provider_reply_at is null
          then metric_rows.created_at
            + make_interval(
                mins =>
                  metric_rows.first_response_threshold_minutes
              )

        when metric_rows.last_conversation_sender_type =
          'customer'
          and metric_rows.last_customer_message_at
            is not null
          then metric_rows.last_customer_message_at
            + make_interval(
                mins =>
                  metric_rows.follow_up_threshold_minutes
              )

        else null
      end
        as operational_deadline_at,

      case
        when metric_rows.status = 'closed'
          then 'closed'

        when metric_rows.status = 'resolved'
          then 'resolved'

        when metric_rows.first_provider_reply_at is null
          and v_now >=
            metric_rows.created_at
            + make_interval(
                mins =>
                  metric_rows.first_response_threshold_minutes
              )
          then 'overdue'

        when metric_rows.first_provider_reply_at is null
          and v_now >=
            metric_rows.created_at
            + make_interval(
                mins =>
                  ceil(
                    metric_rows
                      .first_response_threshold_minutes
                    * 0.75
                  )::integer
              )
          then 'attention'

        when metric_rows.first_provider_reply_at is null
          then 'awaiting_first_response'

        when metric_rows.last_conversation_sender_type =
          'provider'
          then 'waiting_customer'

        when metric_rows.last_conversation_sender_type =
          'customer'
          and metric_rows.last_customer_message_at
            is not null
          and v_now >=
            metric_rows.last_customer_message_at
            + make_interval(
                mins =>
                  metric_rows.follow_up_threshold_minutes
              )
          then 'overdue'

        when metric_rows.last_conversation_sender_type =
          'customer'
          and metric_rows.last_customer_message_at
            is not null
          and v_now >=
            metric_rows.last_customer_message_at
            + make_interval(
                mins =>
                  ceil(
                    metric_rows
                      .follow_up_threshold_minutes
                    * 0.75
                  )::integer
              )
          then 'attention'

        else 'within_time'
      end
        as operational_state

    from metric_rows
  ),

  common_filtered_rows as (
    select timed_rows.*

    from timed_rows

    where
      (
        p_priority is null
        or timed_rows.priority = p_priority
      )

      and (
        p_category is null
        or timed_rows.category = p_category
      )

      and (
        v_search is null

        or position(
          lower(v_search)
          in lower(timed_rows.ticket_number)
        ) > 0

        or position(
          lower(v_search)
          in lower(timed_rows.title)
        ) > 0
      )

      and (
        v_organization is null

        or lower(
          coalesce(
            timed_rows.organization_name,
            ''
          )
        ) = lower(v_organization)
      )

      and (
        v_assignment = 'all'

        or (
          v_assignment = 'me'
          and timed_rows.assigned_to =
            v_provider_user_id
        )

        or (
          v_assignment = 'unassigned'
          and timed_rows.assigned_to is null
        )

        or (
          v_assignment = 'assigned'
          and timed_rows.assigned_to is not null
        )
      )
  ),

  status_filtered_rows as (
    select common_filtered_rows.*

    from common_filtered_rows

    where
      v_status_scope = 'all'

      or (
        v_status_scope = 'active'
        and common_filtered_rows.status in (
          'new',
          'investigating',
          'waiting_customer'
        )
      )

      or common_filtered_rows.status =
        v_status_scope
  ),

  operational_filtered_rows as (
    select status_filtered_rows.*

    from status_filtered_rows

    where
      v_operational_filter = 'all'

      or (
        v_operational_filter =
          'awaiting_first_response'
        and status_filtered_rows.operational_state =
          'awaiting_first_response'
      )

      or (
        v_operational_filter = 'needs_follow_up'
        and status_filtered_rows.status not in (
          'resolved',
          'closed'
        )
        and status_filtered_rows.first_provider_reply_at
          is not null
        and status_filtered_rows
          .last_conversation_sender_type =
          'customer'
      )

      or (
        v_operational_filter = 'attention'
        and status_filtered_rows.operational_state =
          'attention'
      )

      or (
        v_operational_filter = 'overdue'
        and status_filtered_rows.operational_state =
          'overdue'
      )

      or (
        v_operational_filter = 'waiting_customer'
        and status_filtered_rows.operational_state =
          'waiting_customer'
      )
  ),

  paged_rows as (
    select operational_filtered_rows.*

    from operational_filtered_rows

    order by
      coalesce(
        operational_filtered_rows.last_public_message_at,
        operational_filtered_rows.created_at
      ) desc,

      operational_filtered_rows.id desc

    limit v_page_size

    offset (v_page - 1) * v_page_size
  )

  select jsonb_build_object(
    'items',

    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id',
              paged_rows.id,

            'ticket_number',
              paged_rows.ticket_number,

            'category',
              paged_rows.category,

            'priority',
              paged_rows.priority,

            'status',
              paged_rows.status,

            'title',
              paged_rows.title,

            'organization_name',
              coalesce(
                paged_rows.organization_name,
                'منشأة عميل'
              ),

            'is_assigned',
              paged_rows.assigned_to is not null,

            'assigned_to_me',
              paged_rows.assigned_to =
                v_provider_user_id,

            'created_at',
              paged_rows.created_at,

            'updated_at',
              paged_rows.updated_at,

            'first_provider_reply_at',
              paged_rows.first_provider_reply_at,

            'last_customer_message_at',
              paged_rows.last_customer_message_at,

            'last_provider_reply_at',
              paged_rows.last_provider_reply_at,

            'last_public_message_at',
              paged_rows.last_public_message_at,

            'last_public_sender_type',
              paged_rows.last_public_sender_type,

            'public_message_count',
              paged_rows.public_message_count,

            'age_minutes',
              paged_rows.age_minutes,

            'first_response_minutes',
              paged_rows.first_response_minutes,

            'waiting_minutes',
              paged_rows.waiting_minutes,

            'operational_deadline_at',
              paged_rows.operational_deadline_at,

            'first_response_threshold_minutes',
              paged_rows
                .first_response_threshold_minutes,

            'follow_up_threshold_minutes',
              paged_rows
                .follow_up_threshold_minutes,

            'operational_state',
              paged_rows.operational_state,

            'is_overdue',
              paged_rows.operational_state =
                'overdue',

            'is_attention_required',
              paged_rows.operational_state in (
                'attention',
                'overdue'
              )
          )

          order by
            coalesce(
              paged_rows.last_public_message_at,
              paged_rows.created_at
            ) desc,

            paged_rows.id desc
        )

        from paged_rows
      ),

      '[]'::jsonb
    ),

    'pagination',

    jsonb_build_object(
      'page',
        v_page,

      'page_size',
        v_page_size,

      'total',
        (
          select count(*)
          from operational_filtered_rows
        )
    ),

    'summary',

    (
      select jsonb_build_object(
        'total_active',
          count(*) filter (
            where common_filtered_rows.status in (
              'new',
              'investigating',
              'waiting_customer'
            )
          ),

        'new',
          count(*) filter (
            where common_filtered_rows.status = 'new'
          ),

        'investigating',
          count(*) filter (
            where common_filtered_rows.status =
              'investigating'
          ),

        'waiting_customer',
          count(*) filter (
            where common_filtered_rows.status =
              'waiting_customer'
          ),

        'resolved',
          count(*) filter (
            where common_filtered_rows.status =
              'resolved'
          ),

        'closed',
          count(*) filter (
            where common_filtered_rows.status =
              'closed'
          ),

        'critical',
          count(*) filter (
            where common_filtered_rows.priority =
              'critical'
          ),

        'assigned_to_me',
          count(*) filter (
            where common_filtered_rows.assigned_to =
              v_provider_user_id
          ),

        'unassigned',
          count(*) filter (
            where common_filtered_rows.assigned_to
              is null
          ),

        'awaiting_first_response',
          count(*) filter (
            where common_filtered_rows
              .operational_state =
              'awaiting_first_response'
          ),

        'attention',
          count(*) filter (
            where common_filtered_rows
              .operational_state =
              'attention'
          ),

        'overdue',
          count(*) filter (
            where common_filtered_rows
              .operational_state =
              'overdue'
          ),

        'operational_waiting_customer',
          count(*) filter (
            where common_filtered_rows
              .operational_state =
              'waiting_customer'
          )
      )

      from common_filtered_rows
    ),

    'calculated_at',
      v_now
  )
  into v_result;

  return v_result;
end;
$$;


ALTER FUNCTION public.get_provider_support_operational_dashboard(p_provider_user_id uuid, p_page integer, p_page_size integer, p_search text, p_status text, p_priority text, p_category text, p_organization text, p_assignment text, p_operational_filter text) OWNER TO postgres;

--
-- TOC entry 4492 (class 0 OID 0)
-- Dependencies: 558
-- Name: FUNCTION get_provider_support_operational_dashboard(p_provider_user_id uuid, p_page integer, p_page_size integer, p_search text, p_status text, p_priority text, p_category text, p_organization text, p_assignment text, p_operational_filter text); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.get_provider_support_operational_dashboard(p_provider_user_id uuid, p_page integer, p_page_size integer, p_search text, p_status text, p_priority text, p_category text, p_organization text, p_assignment text, p_operational_filter text) IS 'Service-role-only Provider Support dashboard. NULL, empty, or all preserves the all-status behavior. active selects new, investigating, and waiting_customer. Canonical statuses select an exact status. Status scope applies before count, ordering, limit, and offset, while lifecycle summary counts remain status-scope independent.';


--
-- TOC entry 536 (class 1255 OID 17616)
-- Name: hash_pos_pin(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.hash_pos_pin(raw_pin text) RETURNS text
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
  select crypt(raw_pin, extensions.gen_salt('bf'));
$$;


ALTER FUNCTION public.hash_pos_pin(raw_pin text) OWNER TO postgres;

--
-- TOC entry 555 (class 1255 OID 18511)
-- Name: is_active_platform_admin(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.is_active_platform_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
  select exists (
    select 1
    from public.platform_admins
    where public.platform_admins.user_id = auth.uid()
      and public.platform_admins.is_active
  );
$$;


ALTER FUNCTION public.is_active_platform_admin() OWNER TO postgres;

--
-- TOC entry 537 (class 1255 OID 17617)
-- Name: is_admin(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;


ALTER FUNCTION public.is_admin() OWNER TO postgres;

--
-- TOC entry 562 (class 1255 OID 18677)
-- Name: mark_all_developer_support_notifications_read(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.mark_all_developer_support_notifications_read(p_provider_user_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_cutoff timestamptz :=
    statement_timestamp();

  v_inserted_count bigint := 0;
begin
  insert into
    public.support_developer_notification_reads (
      user_id,
      event_type,
      ticket_id,
      message_id,
      read_at
    )

  select
    p_provider_user_id,
    eligible_events.event_type,
    eligible_events.ticket_id,
    eligible_events.message_id,
    v_cutoff

  from
    public
      .get_eligible_developer_support_notification_events(
        p_provider_user_id,
        v_cutoff
      )
      as eligible_events

  on conflict do nothing;

  get diagnostics
    v_inserted_count = row_count;

  return jsonb_build_object(
    'inserted_count',
      v_inserted_count,

    'through',
      v_cutoff
  );
end;
$$;


ALTER FUNCTION public.mark_all_developer_support_notifications_read(p_provider_user_id uuid) OWNER TO postgres;

--
-- TOC entry 4497 (class 0 OID 0)
-- Dependencies: 562
-- Name: FUNCTION mark_all_developer_support_notifications_read(p_provider_user_id uuid); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.mark_all_developer_support_notifications_read(p_provider_user_id uuid) IS 'Service-role-only mark-all operation. PostgreSQL generates a stable statement timestamp and marks only events eligible at or before that cutoff. Returns the inserted marker count and cutoff.';


--
-- TOC entry 561 (class 1255 OID 18676)
-- Name: mark_developer_support_notification_read(uuid, text, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.mark_developer_support_notification_read(p_provider_user_id uuid, p_event_type text, p_event_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog', 'public'
    AS $$
declare
  v_event record;
begin
  select eligible_events.*
  into v_event

  from
    public
      .get_eligible_developer_support_notification_events(
        p_provider_user_id,
        statement_timestamp()
      )
      as eligible_events

  where eligible_events.event_type =
      p_event_type

    and eligible_events.event_id =
      p_event_id

  limit 1;

  if v_event.event_id is null
  then
    raise exception using
      errcode = '22023',
      message =
        'Invalid support notification event';
  end if;

  insert into
    public.support_developer_notification_reads (
      user_id,
      event_type,
      ticket_id,
      message_id,
      read_at
    )
  values (
    p_provider_user_id,
    v_event.event_type,
    v_event.ticket_id,
    v_event.message_id,
    statement_timestamp()
  )
  on conflict do nothing;
end;
$$;


ALTER FUNCTION public.mark_developer_support_notification_read(p_provider_user_id uuid, p_event_type text, p_event_id uuid) OWNER TO postgres;

--
-- TOC entry 4499 (class 0 OID 0)
-- Dependencies: 561
-- Name: FUNCTION mark_developer_support_notification_read(p_provider_user_id uuid, p_event_type text, p_event_id uuid); Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON FUNCTION public.mark_developer_support_notification_read(p_provider_user_id uuid, p_event_type text, p_event_id uuid) IS 'Service-role-only idempotent mark-one operation. Event eligibility is resolved exclusively through the centralized helper.';


--
-- TOC entry 538 (class 1255 OID 17618)
-- Name: next_branch_monthly_order_number(uuid, uuid, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.next_branch_monthly_order_number(p_tenant_id uuid, p_branch_id uuid, p_created_at timestamp with time zone DEFAULT now()) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  v_prefix text;
  v_sequence_month date := date_trunc('month', coalesce(p_created_at, now()))::date;
  v_stored_sequence integer;
  v_highest_existing_sequence integer;
  v_next_sequence integer;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Tenant is required for order numbering'
      USING errcode = '23502';
  END IF;

  IF p_branch_id IS NULL THEN
    RAISE EXCEPTION 'Branch is required for order numbering'
      USING errcode = '23502';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('afex_branch_monthly_order_number'),
    hashtext(
      p_tenant_id::text || ':' ||
      p_branch_id::text || ':' ||
      v_sequence_month::text
    )
  );

  v_prefix := public.ensure_branch_order_number_prefix(p_branch_id);

  INSERT INTO public.order_number_sequences (
    tenant_id,
    branch_id,
    sequence_month,
    last_sequence,
    updated_at
  )
  VALUES (
    p_tenant_id,
    p_branch_id,
    v_sequence_month,
    0,
    now()
  )
  ON CONFLICT (tenant_id, branch_id, sequence_month)
  DO NOTHING;

  SELECT ons.last_sequence
  INTO v_stored_sequence
  FROM public.order_number_sequences ons
  WHERE ons.tenant_id = p_tenant_id
    AND ons.branch_id = p_branch_id
    AND ons.sequence_month = v_sequence_month
  FOR UPDATE;

  SELECT COALESCE(
    MAX(
      (substring(o.order_number FROM length(v_prefix) + 2))::integer
    ),
    0
  )
  INTO v_highest_existing_sequence
  FROM public.orders o
  WHERE o.tenant_id = p_tenant_id
    AND o.branch_id = p_branch_id
    AND date_trunc('month', coalesce(o.created_at, now()))::date = v_sequence_month
    AND left(o.order_number, length(v_prefix) + 1) = v_prefix || '-'
    AND substring(o.order_number FROM length(v_prefix) + 2) ~ '^[0-9]+$';

  IF v_highest_existing_sequence > v_stored_sequence THEN
    UPDATE public.order_number_sequences ons
    SET
      last_sequence = v_highest_existing_sequence,
      updated_at = now()
    WHERE ons.tenant_id = p_tenant_id
      AND ons.branch_id = p_branch_id
      AND ons.sequence_month = v_sequence_month;
  END IF;

  UPDATE public.order_number_sequences ons
  SET
    last_sequence = ons.last_sequence + 1,
    updated_at = now()
  WHERE ons.tenant_id = p_tenant_id
    AND ons.branch_id = p_branch_id
    AND ons.sequence_month = v_sequence_month
  RETURNING ons.last_sequence
  INTO v_next_sequence;

  RETURN v_prefix || '-' || lpad(v_next_sequence::text, 4, '0');
END;
$_$;


ALTER FUNCTION public.next_branch_monthly_order_number(p_tenant_id uuid, p_branch_id uuid, p_created_at timestamp with time zone) OWNER TO postgres;

--
-- TOC entry 539 (class 1255 OID 17619)
-- Name: purge_expired_deleted_branches(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.purge_expired_deleted_branches() RETURNS TABLE(tenant_id uuid, branch_id uuid, branch_name text, deleted_at timestamp with time zone, purged_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_branch record;
  v_purged_at timestamptz;
begin
  for v_branch in
    select b.id, b.tenant_id, b.name, b.deleted_at
    from public.branches as b
    where b.deleted_at is not null
      and b.deleted_at < now() - interval '30 days'
    order by b.deleted_at asc, b.id asc
  loop
    perform pg_advisory_xact_lock(
      hashtext('afex_purge_deleted_branch'),
      hashtext(v_branch.tenant_id::text || ':' || v_branch.id::text)
    );

    if not exists (
      select 1
      from public.branches as b
      where b.id = v_branch.id
        and b.tenant_id = v_branch.tenant_id
        and b.deleted_at is not null
        and b.deleted_at < now() - interval '30 days'
    ) then
      continue;
    end if;

    v_purged_at := now();

    update public.profiles as p
    set branch_id = null
    where p.tenant_id = v_branch.tenant_id
      and p.branch_id = v_branch.id;

    delete from public.invoice_items as ii
    where ii.tenant_id = v_branch.tenant_id
      and ii.invoice_id in (
        select i.id
        from public.invoices as i
        where i.tenant_id = v_branch.tenant_id
          and i.branch_id = v_branch.id
      );

    delete from public.invoices as i
    where i.tenant_id = v_branch.tenant_id
      and i.branch_id = v_branch.id;

    delete from public.orders as o
    where o.tenant_id = v_branch.tenant_id
      and o.branch_id = v_branch.id;

    delete from public.customers as c
    where c.tenant_id = v_branch.tenant_id
      and c.branch_id = v_branch.id;

    delete from public.discounts as d
    where d.branch_id = v_branch.id;

    delete from public.vat_settings as vs
    where vs.branch_id = v_branch.id;

    delete from public.branch_whatsapp_configs as bwc
    where bwc.branch_id = v_branch.id;

    delete from public.branch_catalog_items as bci
    where bci.branch_id = v_branch.id;

    delete from public.order_number_sequences as ons
    where ons.tenant_id = v_branch.tenant_id
      and ons.branch_id = v_branch.id;

    delete from public.branches as b
    where b.tenant_id = v_branch.tenant_id
      and b.id = v_branch.id;

    tenant_id := v_branch.tenant_id;
    branch_id := v_branch.id;
    branch_name := v_branch.name;
    deleted_at := v_branch.deleted_at;
    purged_at := v_purged_at;
    return next;
  end loop;
end;
$$;


ALTER FUNCTION public.purge_expired_deleted_branches() OWNER TO postgres;

--
-- TOC entry 540 (class 1255 OID 17620)
-- Name: resolve_insert_branch_id(uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.resolve_insert_branch_id(requested_branch_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  resolved_branch_id uuid;
begin
  if requested_branch_id is not null then
    return requested_branch_id;
  end if;

  select p.branch_id
  into resolved_branch_id
  from public.profiles p
  where p.id = auth.uid()
  limit 1;

  if resolved_branch_id is not null then
    return resolved_branch_id;
  end if;

  select b.id
  into resolved_branch_id
  from public.branches b
  where b.code = 'main'
  limit 1;

  return resolved_branch_id;
end;
$$;


ALTER FUNCTION public.resolve_insert_branch_id(requested_branch_id uuid) OWNER TO postgres;

--
-- TOC entry 541 (class 1255 OID 17621)
-- Name: restore_inventory_for_cancelled_invoice(uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.restore_inventory_for_cancelled_invoice(p_invoice_id uuid, p_tenant_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_branch_id uuid;
begin
  select i.branch_id
  into v_branch_id
  from public.invoices i
  where i.id = p_invoice_id
    and i.tenant_id = p_tenant_id;

  if v_branch_id is null then
    raise exception 'invoice not found for tenant';
  end if;

  insert into public.inventory_stock (
    tenant_id,
    branch_id,
    catalog_item_id,
    quantity_on_hand,
    low_stock_threshold
  )
  select
    p_tenant_id,
    v_branch_id,
    resolved.catalog_item_id,
    0,
    0
  from (
    select
      coalesce(ci.id, bci.catalog_item_id) as catalog_item_id
    from public.invoice_items ii
    left join public.catalog_items ci
      on ci.id = ii.item_id
     and ci.tenant_id = p_tenant_id
    left join public.branch_catalog_items bci
      on bci.id = ii.item_id
     and bci.tenant_id = p_tenant_id
     and bci.branch_id = v_branch_id
    where ii.invoice_id = p_invoice_id
  ) resolved
  where resolved.catalog_item_id is not null
  on conflict (tenant_id, branch_id, catalog_item_id)
  do nothing;

  update public.inventory_stock s
  set
    quantity_on_hand = s.quantity_on_hand + restored.quantity,
    updated_at = now()
  from (
    select
      coalesce(ci.id, bci.catalog_item_id) as catalog_item_id,
      sum(ii.quantity)::numeric as quantity
    from public.invoice_items ii
    left join public.catalog_items ci
      on ci.id = ii.item_id
     and ci.tenant_id = p_tenant_id
    left join public.branch_catalog_items bci
      on bci.id = ii.item_id
     and bci.tenant_id = p_tenant_id
     and bci.branch_id = v_branch_id
    join public.catalog_items item
      on item.id = coalesce(ci.id, bci.catalog_item_id)
     and item.tenant_id = p_tenant_id
    where ii.invoice_id = p_invoice_id
      and item.track_inventory = true
      and (
        item.item_type = 'product'
        or item.is_composite = true
      )
      and not exists (
        select 1
        from public.inventory_movements im
        where im.tenant_id = p_tenant_id
          and im.source_id = p_invoice_id
          and im.source_type = 'invoice_cancel'
          and im.movement_type = 'sale_void'
          and im.catalog_item_id = item.id
      )
    group by coalesce(ci.id, bci.catalog_item_id)
  ) restored
  where s.tenant_id = p_tenant_id
    and s.branch_id = v_branch_id
    and s.catalog_item_id = restored.catalog_item_id;

  insert into public.inventory_movements (
    tenant_id,
    branch_id,
    catalog_item_id,
    movement_type,
    quantity_delta,
    source_type,
    source_id,
    notes
  )
  select
    p_tenant_id,
    v_branch_id,
    restored.catalog_item_id,
    'sale_void',
    restored.quantity,
    'invoice_cancel',
    p_invoice_id,
    'Inventory restored after cancelled invoice'
  from (
    select
      coalesce(ci.id, bci.catalog_item_id) as catalog_item_id,
      sum(ii.quantity)::numeric as quantity
    from public.invoice_items ii
    left join public.catalog_items ci
      on ci.id = ii.item_id
     and ci.tenant_id = p_tenant_id
    left join public.branch_catalog_items bci
      on bci.id = ii.item_id
     and bci.tenant_id = p_tenant_id
     and bci.branch_id = v_branch_id
    join public.catalog_items item
      on item.id = coalesce(ci.id, bci.catalog_item_id)
     and item.tenant_id = p_tenant_id
    where ii.invoice_id = p_invoice_id
      and item.track_inventory = true
      and (
        item.item_type = 'product'
        or item.is_composite = true
      )
      and not exists (
        select 1
        from public.inventory_movements im
        where im.tenant_id = p_tenant_id
          and im.source_id = p_invoice_id
          and im.source_type = 'invoice_cancel'
          and im.movement_type = 'sale_void'
          and im.catalog_item_id = item.id
      )
    group by coalesce(ci.id, bci.catalog_item_id)
  ) restored;
end;
$$;


ALTER FUNCTION public.restore_inventory_for_cancelled_invoice(p_invoice_id uuid, p_tenant_id uuid) OWNER TO postgres;

--
-- TOC entry 542 (class 1255 OID 17622)
-- Name: rls_auto_enable(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.rls_auto_enable() RETURNS event_trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION public.rls_auto_enable() OWNER TO postgres;

--
-- TOC entry 543 (class 1255 OID 17623)
-- Name: set_customers_branch_id(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_customers_branch_id() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.branch_id is null then
    new.branch_id := public.resolve_insert_branch_id(new.branch_id);
  end if;

  return new;
end;
$$;


ALTER FUNCTION public.set_customers_branch_id() OWNER TO postgres;

--
-- TOC entry 544 (class 1255 OID 17624)
-- Name: set_invoice_number_from_order(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_invoice_number_from_order() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

  new.invoice_number := v_order_number;

  if new.tenant_id is null then
    new.tenant_id := v_order_tenant_id;
  end if;

  if new.branch_id is null then
    new.branch_id := v_order_branch_id;
  end if;

  return new;
end;
$$;


ALTER FUNCTION public.set_invoice_number_from_order() OWNER TO postgres;

--
-- TOC entry 545 (class 1255 OID 17625)
-- Name: set_invoices_branch_id(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_invoices_branch_id() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.branch_id is null then
    new.branch_id := public.resolve_insert_branch_id(new.branch_id);
  end if;

  return new;
end;
$$;


ALTER FUNCTION public.set_invoices_branch_id() OWNER TO postgres;

--
-- TOC entry 546 (class 1255 OID 17626)
-- Name: set_order_number_branch_monthly(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_order_number_branch_monthly() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_branch_id uuid := new.branch_id;
  v_tenant_id uuid := new.tenant_id;
begin
  if v_tenant_id is null and v_branch_id is not null then
    select tenant_id into v_tenant_id
    from public.branches
    where id = v_branch_id
    limit 1;
  end if;

  if v_tenant_id is null then
    v_tenant_id := public.resolve_default_tenant_id();
    new.tenant_id := v_tenant_id;
  end if;

  if v_branch_id is null then
    select id into v_branch_id
    from public.branches
    where tenant_id = v_tenant_id
    order by created_at asc, id asc
    limit 1;
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


ALTER FUNCTION public.set_order_number_branch_monthly() OWNER TO postgres;

--
-- TOC entry 547 (class 1255 OID 17627)
-- Name: set_orders_branch_id(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_orders_branch_id() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.branch_id is null then
    new.branch_id := public.resolve_insert_branch_id(new.branch_id);
  end if;

  return new;
end;
$$;


ALTER FUNCTION public.set_orders_branch_id() OWNER TO postgres;

--
-- TOC entry 548 (class 1255 OID 17628)
-- Name: set_pos_pin(text, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_pos_pin(raw_pin text, user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $_$
begin
  if raw_pin !~ '^[0-9]{4}$' then
    raise exception 'POS PIN must be exactly 4 digits';
  end if;

  update public.profiles
  set pos_pin_hash = extensions.crypt(raw_pin, extensions.gen_salt('bf'))
  where id = user_id;
end;
$_$;


ALTER FUNCTION public.set_pos_pin(raw_pin text, user_id uuid) OWNER TO postgres;

--
-- TOC entry 549 (class 1255 OID 17629)
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION public.set_updated_at() OWNER TO postgres;

--
-- TOC entry 550 (class 1255 OID 17630)
-- Name: set_updated_at_system_settings(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_updated_at_system_settings() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION public.set_updated_at_system_settings() OWNER TO postgres;

--
-- TOC entry 551 (class 1255 OID 17631)
-- Name: set_vat_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.set_vat_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION public.set_vat_updated_at() OWNER TO postgres;

--
-- TOC entry 556 (class 1255 OID 18512)
-- Name: touch_support_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.touch_support_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog', 'public'
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION public.touch_support_updated_at() OWNER TO postgres;

--
-- TOC entry 552 (class 1255 OID 17632)
-- Name: update_inventory_low_stock_threshold(uuid, uuid, uuid, numeric); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.update_inventory_low_stock_threshold(p_tenant_id uuid, p_branch_id uuid, p_catalog_item_id uuid, p_low_stock_threshold numeric) RETURNS TABLE(result_catalog_item_id uuid, result_quantity_on_hand numeric, result_low_stock_threshold numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
begin
  if p_tenant_id is null or p_branch_id is null or p_catalog_item_id is null then
    raise exception 'missing required inventory scope';
  end if;

  if p_low_stock_threshold is null or p_low_stock_threshold < 0 then
    raise exception 'invalid low stock threshold';
  end if;

  if not exists (
    select 1 from public.branches b
    where b.id = p_branch_id and b.tenant_id = p_tenant_id
  ) then
    raise exception 'branch does not belong to tenant';
  end if;

  if not exists (
    select 1 from public.catalog_items ci
    where ci.id = p_catalog_item_id
      and ci.tenant_id = p_tenant_id
      and coalesce(ci.track_inventory, false) = true
  ) then
    raise exception 'catalog item does not belong to tenant or inventory is not enabled';
  end if;

  insert into public.inventory_stock as s (
    tenant_id, branch_id, catalog_item_id, quantity_on_hand, low_stock_threshold, updated_at
  )
  values (
    p_tenant_id, p_branch_id, p_catalog_item_id, 0, p_low_stock_threshold, now()
  )
  on conflict (tenant_id, branch_id, catalog_item_id)
  do update set
    low_stock_threshold = excluded.low_stock_threshold,
    updated_at = now();

  return query
  select
    s.catalog_item_id,
    s.quantity_on_hand,
    s.low_stock_threshold
  from public.inventory_stock s
  where s.tenant_id = p_tenant_id
    and s.branch_id = p_branch_id
    and s.catalog_item_id = p_catalog_item_id;
end;
$$;


ALTER FUNCTION public.update_inventory_low_stock_threshold(p_tenant_id uuid, p_branch_id uuid, p_catalog_item_id uuid, p_low_stock_threshold numeric) OWNER TO postgres;

--
-- TOC entry 553 (class 1255 OID 17633)
-- Name: validate_password_policy(text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.validate_password_policy(p_password text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $_$
  select
    length(coalesce(p_password, '')) >= 8
    and p_password ~ '[A-Z]'
    and p_password ~ '[a-z]'
    and p_password ~ '[0-9]'
    and p_password ~ '[@#$%]'
    and p_password !~ '[\u0600-\u06FF]';
$_$;


ALTER FUNCTION public.validate_password_policy(p_password text) OWNER TO postgres;

--
-- TOC entry 554 (class 1255 OID 17634)
-- Name: verify_pos_pin_for_actor(text, uuid, uuid); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.verify_pos_pin_for_actor(p_raw_pin text, p_actor_user_id uuid, p_requested_branch_id uuid DEFAULT NULL::uuid) RETURNS TABLE(id uuid, username text, full_name text, role text, branch_id uuid)
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
  with actor_scope as (
    select
      p.tenant_id,
      p.branch_id,
      p.role,
      case
        when p.role::text in ('owner', 'admin', 'manager')
          then p_requested_branch_id
        else p.branch_id
      end as effective_branch_id
    from public.profiles as p
    where p.id = p_actor_user_id
      and p.tenant_id is not null
      and p.role::text in (
        'owner',
        'admin',
        'manager',
        'employee',
        'cashier'
      )
      and coalesce(p.is_active, true) = true
      and (
        p.role::text in ('owner', 'admin', 'manager')
        or p.branch_id is not null
      )
      and (
        p.role::text in ('owner', 'admin', 'manager')
        or p_requested_branch_id is null
        or p_requested_branch_id = p.branch_id
      )
  ),
  validated_scope as (
    select actor_scope.*
    from actor_scope
    where actor_scope.effective_branch_id is null
      or exists (
        select 1
        from public.branches as b
        where b.id = actor_scope.effective_branch_id
          and b.tenant_id = actor_scope.tenant_id
      )
  )
  select
    pp.id::uuid as id,
    pp.username::text as username,
    pp.full_name::text as full_name,
    pp.role::text as role,
    pp.branch_id::uuid as branch_id
  from public.pos_profiles as pp
  cross join validated_scope as scope
  where p_raw_pin ~ '^[0-9]{4}$'
    and pp.tenant_id = scope.tenant_id
    and pp.is_active = true
    and pp.role::text in (
      'cashier',
      'employee',
      'manager',
      'admin'
    )
    and pp.pos_pin_hash is not null
    and extensions.crypt(
      p_raw_pin,
      pp.pos_pin_hash
    ) = pp.pos_pin_hash
    and (
      scope.effective_branch_id is null
      or pp.branch_id = scope.effective_branch_id
    )
  order by pp.created_at asc
$_$;


ALTER FUNCTION public.verify_pos_pin_for_actor(p_raw_pin text, p_actor_user_id uuid, p_requested_branch_id uuid) OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 372 (class 1259 OID 17635)
-- Name: announcement_manual_customers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.announcement_manual_customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    announcement_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.announcement_manual_customers OWNER TO postgres;

--
-- TOC entry 373 (class 1259 OID 17640)
-- Name: announcement_recipients; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.announcement_recipients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    announcement_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid,
    customer_id uuid NOT NULL,
    customer_name text,
    phone text NOT NULL,
    whatsapp_url text,
    send_status text DEFAULT 'pending'::text NOT NULL,
    sent_at timestamp with time zone,
    opened_at timestamp with time zone,
    clicked_at timestamp with time zone,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT announcement_recipients_send_status_check CHECK ((send_status = ANY (ARRAY['pending'::text, 'link_generated'::text, 'sent'::text, 'failed'::text, 'skipped'::text])))
);


ALTER TABLE public.announcement_recipients OWNER TO postgres;

--
-- TOC entry 374 (class 1259 OID 17649)
-- Name: announcements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.announcements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid,
    title text NOT NULL,
    message text NOT NULL,
    announcement_type text NOT NULL,
    discount_code text,
    audience_type text DEFAULT 'all_customers'::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    created_by uuid,
    scheduled_at timestamp with time zone,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    cta_label text,
    cta_url text,
    image_url text,
    CONSTRAINT announcements_announcement_type_check CHECK ((announcement_type = ANY (ARRAY['discount'::text, 'seasonal_offer'::text, 'discount_code'::text, 'general_alert'::text, 'marketing_campaign'::text]))),
    CONSTRAINT announcements_audience_type_check CHECK ((audience_type = ANY (ARRAY['all_customers'::text, 'branch_customers'::text, 'manual_customers'::text]))),
    CONSTRAINT announcements_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'ready'::text, 'sent'::text, 'archived'::text])))
);


ALTER TABLE public.announcements OWNER TO postgres;

--
-- TOC entry 375 (class 1259 OID 17662)
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid,
    branch_id uuid,
    actor_user_id uuid,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    ip_address text,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.audit_logs OWNER TO postgres;

--
-- TOC entry 376 (class 1259 OID 17670)
-- Name: branch_catalog_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.branch_catalog_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    branch_id uuid NOT NULL,
    catalog_item_id uuid NOT NULL,
    price numeric NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    display_order integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid
);


ALTER TABLE public.branch_catalog_items OWNER TO postgres;

--
-- TOC entry 377 (class 1259 OID 17679)
-- Name: branch_whatsapp_configs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.branch_whatsapp_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    branch_id uuid NOT NULL,
    provider text NOT NULL,
    phone_number text NOT NULL,
    instance_id text NOT NULL,
    token text NOT NULL,
    api_url text NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid,
    CONSTRAINT branch_whatsapp_configs_provider_check CHECK ((provider = ANY (ARRAY['ultramsg'::text, 'meta'::text])))
);


ALTER TABLE public.branch_whatsapp_configs OWNER TO postgres;

--
-- TOC entry 378 (class 1259 OID 17689)
-- Name: branches; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.branches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid,
    map_url text,
    display_store_name text,
    display_branch_name text,
    order_number_prefix text,
    deleted_at timestamp with time zone,
    deleted_by uuid
);


ALTER TABLE public.branches OWNER TO postgres;

--
-- TOC entry 379 (class 1259 OID 17698)
-- Name: catalog_categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.catalog_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid
);


ALTER TABLE public.catalog_categories OWNER TO postgres;

--
-- TOC entry 380 (class 1259 OID 17708)
-- Name: catalog_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.catalog_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    category text NOT NULL,
    item_type text NOT NULL,
    default_price numeric NOT NULL,
    image_url text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    cost_price numeric DEFAULT 0 NOT NULL,
    pos_display_mode text DEFAULT 'style'::text NOT NULL,
    pos_color text,
    pos_shape text,
    deleted_at timestamp without time zone,
    tenant_id uuid,
    track_inventory boolean DEFAULT false NOT NULL,
    inventory_enabled_at timestamp with time zone,
    is_composite boolean DEFAULT false NOT NULL,
    CONSTRAINT catalog_items_item_type_check CHECK ((item_type = ANY (ARRAY['product'::text, 'service'::text])))
);


ALTER TABLE public.catalog_items OWNER TO postgres;

--
-- TOC entry 381 (class 1259 OID 17722)
-- Name: categories; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    type text DEFAULT 'general'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT categories_type_check CHECK ((type = ANY (ARRAY['product'::text, 'service'::text, 'general'::text])))
);


ALTER TABLE public.categories OWNER TO postgres;

--
-- TOC entry 382 (class 1259 OID 17732)
-- Name: customers; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    phone text NOT NULL,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    branch_id uuid,
    tenant_id uuid,
    email text,
    address text,
    city text,
    district text,
    postal_code text,
    country text,
    customer_code text,
    tax_number text
);


ALTER TABLE public.customers OWNER TO postgres;

--
-- TOC entry 383 (class 1259 OID 17740)
-- Name: discounts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.discounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    value numeric NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    branch_id uuid,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid,
    CONSTRAINT discounts_type_check CHECK ((type = ANY (ARRAY['percentage'::text, 'fixed'::text]))),
    CONSTRAINT discounts_value_check CHECK ((value >= (0)::numeric))
);


ALTER TABLE public.discounts OWNER TO postgres;

--
-- TOC entry 384 (class 1259 OID 17751)
-- Name: inventory_movements; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.inventory_movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    catalog_item_id uuid NOT NULL,
    movement_type text NOT NULL,
    quantity_delta numeric NOT NULL,
    source_type text,
    source_id uuid,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inventory_movements_movement_type_check CHECK ((movement_type = ANY (ARRAY['purchase_receive'::text, 'manual_adjustment'::text, 'sale'::text, 'sale_void'::text, 'transfer_in'::text, 'transfer_out'::text])))
);


ALTER TABLE public.inventory_movements OWNER TO postgres;

--
-- TOC entry 385 (class 1259 OID 17759)
-- Name: invoice_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.invoice_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_id uuid NOT NULL,
    item_id uuid,
    item_name_snapshot text NOT NULL,
    item_type_snapshot text NOT NULL,
    quantity integer NOT NULL,
    unit_price numeric(10,2) DEFAULT 0 NOT NULL,
    line_total numeric(10,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    item_category_snapshot text,
    cost_price numeric DEFAULT 0 NOT NULL,
    tenant_id uuid,
    CONSTRAINT invoice_items_item_type_snapshot_check CHECK ((item_type_snapshot = ANY (ARRAY['product'::text, 'service'::text]))),
    CONSTRAINT invoice_items_quantity_check CHECK ((quantity > 0))
);


ALTER TABLE public.invoice_items OWNER TO postgres;

--
-- TOC entry 386 (class 1259 OID 17771)
-- Name: invoices; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_number text DEFAULT public.generate_invoice_number() NOT NULL,
    order_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    payment_method text NOT NULL,
    payment_status text DEFAULT 'paid'::text NOT NULL,
    subtotal numeric(10,2) DEFAULT 0 NOT NULL,
    discount numeric(10,2) DEFAULT 0 NOT NULL,
    tax numeric(10,2) DEFAULT 0 NOT NULL,
    total numeric(10,2) DEFAULT 0 NOT NULL,
    note text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    cash_received numeric DEFAULT 0,
    remaining_from_customer numeric DEFAULT 0,
    cash_change numeric DEFAULT 0,
    branch_id uuid,
    tenant_id uuid,
    invoice_sequence_month date GENERATED ALWAYS AS ((((created_at AT TIME ZONE 'UTC'::text))::date - ((EXTRACT(day FROM (created_at AT TIME ZONE 'UTC'::text)))::integer - 1))) STORED,
    CONSTRAINT invoices_payment_method_check CHECK ((payment_method = ANY (ARRAY['cash'::text, 'card'::text, 'transfer'::text, 'mada'::text, 'visa'::text, 'on_delivery'::text]))),
    CONSTRAINT invoices_payment_status_check CHECK ((payment_status = ANY (ARRAY['pending'::text, 'paid'::text, 'failed'::text, 'refunded'::text, 'cancelled'::text])))
);


ALTER TABLE public.invoices OWNER TO postgres;

--
-- TOC entry 387 (class 1259 OID 17791)
-- Name: orders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_number text DEFAULT public.generate_order_number() NOT NULL,
    customer_id uuid NOT NULL,
    status text DEFAULT 'new'::text NOT NULL,
    created_by uuid,
    received_at timestamp with time zone DEFAULT now() NOT NULL,
    due_date timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    branch_id uuid,
    tenant_id uuid,
    client_idempotency_key text,
    created_by_employee_id uuid,
    order_sequence_month date GENERATED ALWAYS AS ((((created_at AT TIME ZONE 'UTC'::text))::date - ((EXTRACT(day FROM (created_at AT TIME ZONE 'UTC'::text)))::integer - 1))) STORED,
    CONSTRAINT orders_status_check CHECK ((status = ANY (ARRAY['in_progress'::text, 'ready'::text, 'closed'::text])))
);


ALTER TABLE public.orders OWNER TO postgres;

--
-- TOC entry 388 (class 1259 OID 17804)
-- Name: pos_profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pos_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid,
    username text NOT NULL,
    full_name text NOT NULL,
    phone text,
    role text DEFAULT 'cashier'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_name text,
    created_by_username text,
    pos_pin_hash text,
    CONSTRAINT pos_profiles_full_name_not_empty CHECK ((length(TRIM(BOTH FROM full_name)) > 0)),
    CONSTRAINT pos_profiles_pin_hash_required CHECK (((pos_pin_hash IS NOT NULL) AND (length(TRIM(BOTH FROM pos_pin_hash)) > 0)))
);


ALTER TABLE public.pos_profiles OWNER TO postgres;

--
-- TOC entry 389 (class 1259 OID 17816)
-- Name: profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    full_name text NOT NULL,
    role text DEFAULT 'worker'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    username text NOT NULL,
    branch_id uuid,
    contact_email text,
    phone text,
    pos_pin_hash text,
    tenant_id uuid,
    tenant_name text,
    CONSTRAINT profiles_admin_employee_email_rule_chk CHECK ((((role = ANY (ARRAY['admin'::text, 'employee'::text, 'manager'::text, 'owner'::text])) AND (contact_email IS NOT NULL) AND (length(TRIM(BOTH FROM contact_email)) > 0)) OR ((role = 'cashier'::text) AND ((contact_email IS NULL) OR (length(TRIM(BOTH FROM contact_email)) = 0))))),
    CONSTRAINT profiles_admin_employee_require_email_chk CHECK ((((role = ANY (ARRAY['admin'::text, 'employee'::text, 'manager'::text, 'owner'::text])) AND (contact_email IS NOT NULL) AND (length(TRIM(BOTH FROM contact_email)) > 0)) OR ((role = 'cashier'::text) AND (contact_email IS NULL)) OR (role <> ALL (ARRAY['admin'::text, 'employee'::text, 'manager'::text, 'owner'::text, 'cashier'::text])))),
    CONSTRAINT profiles_role_allowed_chk CHECK ((role = ANY (ARRAY['admin'::text, 'employee'::text, 'cashier'::text, 'manager'::text, 'owner'::text]))),
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'employee'::text, 'cashier'::text])))
);


ALTER TABLE public.profiles OWNER TO postgres;

--
-- TOC entry 390 (class 1259 OID 17829)
-- Name: inventory_movements_view; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.inventory_movements_view WITH (security_invoker='on') AS
 SELECT im.id,
    im.tenant_id,
    im.branch_id,
    im.catalog_item_id,
    im.movement_type,
    im.quantity_delta,
    im.source_type,
    im.source_id,
    im.notes,
    im.created_by,
    im.created_at,
    ci.name AS item_name,
    b.name AS branch_name,
    resolved_invoice.id AS resolved_invoice_id,
    source_order.created_by_employee_id AS resolved_employee_id,
    COALESCE(NULLIF(TRIM(BOTH FROM employee_pos.full_name), ''::text), NULLIF(TRIM(BOTH FROM employee_pos.username), ''::text), NULLIF(TRIM(BOTH FROM (to_jsonb(employee_pos.*) ->> 'name'::text)), ''::text), NULLIF(TRIM(BOTH FROM employee_profile.full_name), ''::text), NULLIF(TRIM(BOTH FROM (to_jsonb(employee_profile.*) ->> 'name'::text)), ''::text), NULLIF(TRIM(BOTH FROM employee_profile.username), ''::text)) AS resolved_employee_name,
    COALESCE(NULLIF(TRIM(BOTH FROM actor_profile.full_name), ''::text), NULLIF(TRIM(BOTH FROM (to_jsonb(actor_profile.*) ->> 'name'::text)), ''::text), NULLIF(TRIM(BOTH FROM actor_profile.username), ''::text), NULLIF(TRIM(BOTH FROM actor_pos.full_name), ''::text), NULLIF(TRIM(BOTH FROM actor_pos.username), ''::text), NULLIF(TRIM(BOTH FROM (to_jsonb(actor_pos.*) ->> 'name'::text)), ''::text), NULLIF(TRIM(BOTH FROM employee_pos.full_name), ''::text), NULLIF(TRIM(BOTH FROM employee_pos.username), ''::text), NULLIF(TRIM(BOTH FROM (to_jsonb(employee_pos.*) ->> 'name'::text)), ''::text), NULLIF(TRIM(BOTH FROM employee_profile.full_name), ''::text), NULLIF(TRIM(BOTH FROM (to_jsonb(employee_profile.*) ->> 'name'::text)), ''::text), NULLIF(TRIM(BOTH FROM employee_profile.username), ''::text), 'النظام'::text) AS created_by_name,
    COALESCE(NULLIF(TRIM(BOTH FROM actor_profile.full_name), ''::text), NULLIF(TRIM(BOTH FROM (to_jsonb(actor_profile.*) ->> 'name'::text)), ''::text), NULLIF(TRIM(BOTH FROM actor_profile.username), ''::text), NULLIF(TRIM(BOTH FROM actor_pos.full_name), ''::text), NULLIF(TRIM(BOTH FROM actor_pos.username), ''::text), NULLIF(TRIM(BOTH FROM (to_jsonb(actor_pos.*) ->> 'name'::text)), ''::text), NULLIF(TRIM(BOTH FROM employee_pos.full_name), ''::text), NULLIF(TRIM(BOTH FROM employee_pos.username), ''::text), NULLIF(TRIM(BOTH FROM (to_jsonb(employee_pos.*) ->> 'name'::text)), ''::text), NULLIF(TRIM(BOTH FROM employee_profile.full_name), ''::text), NULLIF(TRIM(BOTH FROM (to_jsonb(employee_profile.*) ->> 'name'::text)), ''::text), NULLIF(TRIM(BOTH FROM employee_profile.username), ''::text)) AS actor_name,
        CASE
            WHEN ((actor_profile.id IS NOT NULL) AND (COALESCE((to_jsonb(actor_profile.*) ->> 'role'::text), ''::text) = 'owner'::text)) THEN 'owner'::text
            WHEN (actor_profile.id IS NOT NULL) THEN 'admin'::text
            WHEN (actor_pos.id IS NOT NULL) THEN 'pos_employee'::text
            WHEN ((employee_profile.id IS NOT NULL) AND (COALESCE((to_jsonb(employee_profile.*) ->> 'role'::text), ''::text) = 'owner'::text)) THEN 'owner'::text
            WHEN (employee_profile.id IS NOT NULL) THEN 'admin'::text
            WHEN (employee_pos.id IS NOT NULL) THEN 'pos_employee'::text
            WHEN (im.created_by IS NULL) THEN 'unknown'::text
            ELSE 'system'::text
        END AS actor_type,
    COALESCE(NULLIF(TRIM(BOTH FROM (to_jsonb(actor_profile.*) ->> 'role'::text)), ''::text), NULLIF(TRIM(BOTH FROM (to_jsonb(actor_pos.*) ->> 'role'::text)), ''::text), NULLIF(TRIM(BOTH FROM (to_jsonb(employee_profile.*) ->> 'role'::text)), ''::text), NULLIF(TRIM(BOTH FROM (to_jsonb(employee_pos.*) ->> 'role'::text)), ''::text)) AS actor_position_label,
        CASE COALESCE(NULLIF(TRIM(BOTH FROM (to_jsonb(actor_profile.*) ->> 'role'::text)), ''::text), NULLIF(TRIM(BOTH FROM (to_jsonb(actor_pos.*) ->> 'role'::text)), ''::text), NULLIF(TRIM(BOTH FROM (to_jsonb(employee_profile.*) ->> 'role'::text)), ''::text), NULLIF(TRIM(BOTH FROM (to_jsonb(employee_pos.*) ->> 'role'::text)), ''::text),
            CASE
                WHEN ((actor_profile.id IS NOT NULL) AND (COALESCE((to_jsonb(actor_profile.*) ->> 'role'::text), ''::text) = 'owner'::text)) THEN 'owner'::text
                WHEN (actor_profile.id IS NOT NULL) THEN 'admin'::text
                WHEN (actor_pos.id IS NOT NULL) THEN 'pos_employee'::text
                WHEN ((employee_profile.id IS NOT NULL) AND (COALESCE((to_jsonb(employee_profile.*) ->> 'role'::text), ''::text) = 'owner'::text)) THEN 'owner'::text
                WHEN (employee_profile.id IS NOT NULL) THEN 'admin'::text
                WHEN (employee_pos.id IS NOT NULL) THEN 'pos_employee'::text
                WHEN (im.created_by IS NULL) THEN 'unknown'::text
                ELSE 'system'::text
            END)
            WHEN 'owner'::text THEN 'المالك'::text
            WHEN 'admin'::text THEN 'المدير'::text
            WHEN 'employee'::text THEN 'الإداري'::text
            WHEN 'cashier'::text THEN 'أمين الصندوق'::text
            WHEN 'pos_employee'::text THEN 'موظف POS'::text
            WHEN 'system'::text THEN 'النظام'::text
            WHEN 'unknown'::text THEN 'النظام'::text
            ELSE COALESCE(NULLIF(TRIM(BOTH FROM (to_jsonb(actor_profile.*) ->> 'role'::text)), ''::text), NULLIF(TRIM(BOTH FROM (to_jsonb(actor_pos.*) ->> 'role'::text)), ''::text), NULLIF(TRIM(BOTH FROM (to_jsonb(employee_profile.*) ->> 'role'::text)), ''::text), NULLIF(TRIM(BOTH FROM (to_jsonb(employee_pos.*) ->> 'role'::text)), ''::text), 'النظام'::text)
        END AS actor_role_label
   FROM (((((((((public.inventory_movements im
     LEFT JOIN public.catalog_items ci ON (((ci.id = im.catalog_item_id) AND (ci.tenant_id = im.tenant_id))))
     LEFT JOIN public.branches b ON (((b.id = im.branch_id) AND (b.tenant_id = im.tenant_id))))
     LEFT JOIN public.profiles actor_profile ON (((actor_profile.id = im.created_by) AND (actor_profile.tenant_id = im.tenant_id))))
     LEFT JOIN public.pos_profiles actor_pos ON (((actor_pos.id = im.created_by) AND (actor_pos.tenant_id = im.tenant_id))))
     LEFT JOIN public.invoice_items source_invoice_item ON (((source_invoice_item.id = im.source_id) AND (source_invoice_item.tenant_id = im.tenant_id) AND (im.source_type = 'invoice_item'::text) AND (im.movement_type = ANY (ARRAY['sale'::text, 'sale_void'::text])))))
     LEFT JOIN public.invoices resolved_invoice ON (((resolved_invoice.tenant_id = im.tenant_id) AND (resolved_invoice.id =
        CASE
            WHEN (im.source_type = 'invoice_item'::text) THEN source_invoice_item.invoice_id
            WHEN (im.source_type = ANY (ARRAY['invoice'::text, 'invoice_cancel'::text])) THEN im.source_id
            ELSE NULL::uuid
        END))))
     LEFT JOIN public.orders source_order ON (((source_order.id = resolved_invoice.order_id) AND (source_order.tenant_id = im.tenant_id))))
     LEFT JOIN public.pos_profiles employee_pos ON (((employee_pos.id = source_order.created_by_employee_id) AND (employee_pos.tenant_id = im.tenant_id))))
     LEFT JOIN public.profiles employee_profile ON (((employee_profile.id = source_order.created_by_employee_id) AND (employee_profile.tenant_id = im.tenant_id))));


ALTER VIEW public.inventory_movements_view OWNER TO postgres;

--
-- TOC entry 391 (class 1259 OID 17834)
-- Name: inventory_stock; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.inventory_stock (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    catalog_item_id uuid NOT NULL,
    quantity_on_hand numeric DEFAULT 0 NOT NULL,
    low_stock_threshold numeric DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT inventory_stock_low_stock_threshold_check CHECK ((low_stock_threshold >= (0)::numeric))
);


ALTER TABLE public.inventory_stock OWNER TO postgres;

--
-- TOC entry 392 (class 1259 OID 17844)
-- Name: invoice_number_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.invoice_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.invoice_number_seq OWNER TO postgres;

--
-- TOC entry 393 (class 1259 OID 17845)
-- Name: order_number_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.order_number_seq
    START WITH 1024
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.order_number_seq OWNER TO postgres;

--
-- TOC entry 394 (class 1259 OID 17846)
-- Name: order_number_sequences; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.order_number_sequences (
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    sequence_month date NOT NULL,
    last_sequence integer DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.order_number_sequences OWNER TO postgres;

--
-- TOC entry 395 (class 1259 OID 17851)
-- Name: order_status_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.order_status_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id uuid NOT NULL,
    from_status text,
    to_status text NOT NULL,
    changed_by uuid,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.order_status_logs OWNER TO postgres;

--
-- TOC entry 400 (class 1259 OID 18407)
-- Name: platform_admins; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.platform_admins (
    user_id uuid NOT NULL,
    role text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT platform_admins_role_check CHECK ((role = ANY (ARRAY['provider_owner'::text, 'provider_support'::text])))
);


ALTER TABLE public.platform_admins OWNER TO postgres;

--
-- TOC entry 396 (class 1259 OID 17858)
-- Name: settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    store_name text DEFAULT 'Leather Fix ERP'::text NOT NULL,
    logo_url text,
    phone text,
    address text,
    tax_number text,
    invoice_notes text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.settings OWNER TO postgres;

--
-- TOC entry 405 (class 1259 OID 18561)
-- Name: support_attachments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.support_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    message_id uuid,
    tenant_id uuid NOT NULL,
    uploaded_by_user_id uuid NOT NULL,
    uploader_type text NOT NULL,
    storage_bucket text DEFAULT 'support-attachments'::text NOT NULL,
    storage_path text NOT NULL,
    original_filename text NOT NULL,
    mime_type text NOT NULL,
    size_bytes bigint NOT NULL,
    is_internal boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT support_attachments_is_internal_check CHECK ((is_internal = false)),
    CONSTRAINT support_attachments_mime_type_check CHECK ((mime_type = ANY (ARRAY['image/jpeg'::text, 'image/png'::text, 'image/webp'::text, 'application/pdf'::text]))),
    CONSTRAINT support_attachments_original_filename_check CHECK (((char_length(original_filename) >= 1) AND (char_length(original_filename) <= 180))),
    CONSTRAINT support_attachments_size_bytes_check CHECK (((size_bytes >= 1) AND (size_bytes <= 10485760))),
    CONSTRAINT support_attachments_storage_bucket_check CHECK ((storage_bucket = 'support-attachments'::text)),
    CONSTRAINT support_attachments_uploader_type_check CHECK ((uploader_type = ANY (ARRAY['customer'::text, 'provider'::text])))
);


ALTER TABLE public.support_attachments OWNER TO postgres;

--
-- TOC entry 406 (class 1259 OID 18640)
-- Name: support_developer_notification_reads; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.support_developer_notification_reads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    event_type text NOT NULL,
    ticket_id uuid NOT NULL,
    message_id uuid,
    read_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT support_developer_notification_reads_event_type_check CHECK ((event_type = ANY (ARRAY['ticket_created'::text, 'customer_reply'::text]))),
    CONSTRAINT support_developer_notification_reads_source_check CHECK ((((event_type = 'ticket_created'::text) AND (message_id IS NULL)) OR ((event_type = 'customer_reply'::text) AND (message_id IS NOT NULL))))
);


ALTER TABLE public.support_developer_notification_reads OWNER TO postgres;

--
-- TOC entry 4562 (class 0 OID 0)
-- Dependencies: 406
-- Name: TABLE support_developer_notification_reads; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.support_developer_notification_reads IS 'Persistent per-provider-owner read markers for ticket-created and public customer-reply notifications. Source deletion cascades remove obsolete markers. Direct access is service-role-only.';


--
-- TOC entry 4563 (class 0 OID 0)
-- Dependencies: 406
-- Name: COLUMN support_developer_notification_reads.user_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.support_developer_notification_reads.user_id IS 'Authenticated active provider_owner resolved by the trusted server API and revalidated by notification RPCs. Never trusted from browser input.';


--
-- TOC entry 4564 (class 0 OID 0)
-- Dependencies: 406
-- Name: COLUMN support_developer_notification_reads.message_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.support_developer_notification_reads.message_id IS 'Present only for public customer replies. Provider replies, system messages, and internal notes are ineligible.';


--
-- TOC entry 403 (class 1259 OID 18465)
-- Name: support_messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.support_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    sender_type text NOT NULL,
    message text NOT NULL,
    is_internal boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT support_messages_sender_type_check CHECK ((sender_type = ANY (ARRAY['customer'::text, 'provider'::text, 'system'::text])))
);


ALTER TABLE public.support_messages OWNER TO postgres;

--
-- TOC entry 404 (class 1259 OID 18487)
-- Name: support_ticket_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.support_ticket_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_id uuid NOT NULL,
    actor_id uuid,
    event_type text NOT NULL,
    previous_value jsonb,
    new_value jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.support_ticket_events OWNER TO postgres;

--
-- TOC entry 401 (class 1259 OID 18423)
-- Name: support_ticket_number_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.support_ticket_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.support_ticket_number_seq OWNER TO postgres;

--
-- TOC entry 402 (class 1259 OID 18424)
-- Name: support_tickets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.support_tickets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ticket_number text NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid,
    created_by uuid NOT NULL,
    category text NOT NULL,
    priority text DEFAULT 'normal'::text NOT NULL,
    status text DEFAULT 'new'::text NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    source text DEFAULT 'manual'::text NOT NULL,
    page_path text,
    error_reference text,
    error_code text,
    safe_error_message text,
    diagnostic_context jsonb DEFAULT '{}'::jsonb NOT NULL,
    assigned_to uuid,
    last_message_at timestamp with time zone DEFAULT now() NOT NULL,
    resolved_at timestamp with time zone,
    closed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT support_tickets_category_check CHECK ((category = ANY (ARRAY['technical_error'::text, 'orders'::text, 'inventory'::text, 'invoices'::text, 'whatsapp'::text, 'printing'::text, 'users_permissions'::text, 'performance'::text, 'feature_request'::text, 'other'::text]))),
    CONSTRAINT support_tickets_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'critical'::text]))),
    CONSTRAINT support_tickets_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'error_report'::text, 'system'::text]))),
    CONSTRAINT support_tickets_status_check CHECK ((status = ANY (ARRAY['new'::text, 'investigating'::text, 'waiting_customer'::text, 'resolved'::text, 'closed'::text])))
);


ALTER TABLE public.support_tickets OWNER TO postgres;

--
-- TOC entry 397 (class 1259 OID 17866)
-- Name: system_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.system_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    store_name text DEFAULT 'Leather Fix'::text NOT NULL,
    branch_name text DEFAULT 'الفرع الرئيسي'::text NOT NULL,
    logo_url text,
    whatsapp_provider text DEFAULT 'ultramsg'::text NOT NULL,
    whatsapp_phone text,
    ultramsg_instance_id text,
    ultramsg_token text,
    ultramsg_api_url text,
    enable_whatsapp boolean DEFAULT true NOT NULL,
    enable_printing boolean DEFAULT true NOT NULL,
    enable_pos boolean DEFAULT true NOT NULL,
    enable_invoices boolean DEFAULT true NOT NULL,
    enable_orders boolean DEFAULT true NOT NULL,
    enable_reports boolean DEFAULT true NOT NULL,
    enable_users boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    digital_invoice_brand_name text,
    digital_invoice_branch_name text,
    digital_invoice_address_line_1 text,
    digital_invoice_address_line_2 text,
    digital_invoice_whatsapp_number text,
    digital_invoice_google_review_link text,
    digital_invoice_map_link text,
    digital_invoice_note text,
    digital_invoice_brand_background_color text,
    digital_invoice_brand_text_color text,
    digital_invoice_instagram_enabled boolean DEFAULT false,
    digital_invoice_instagram_link text,
    digital_invoice_tiktok_enabled boolean DEFAULT false,
    digital_invoice_tiktok_link text,
    digital_invoice_whatsapp_enabled boolean DEFAULT true,
    digital_invoice_google_review_enabled boolean DEFAULT true,
    digital_invoice_map_enabled boolean DEFAULT true,
    tenant_id uuid,
    whatsapp_order_ready_message_template text,
    whatsapp_order_delivered_message_template text,
    thermal_invoice_branch_name text,
    thermal_invoice_brand_name text,
    thermal_invoice_footer_message text,
    thermal_invoice_note text,
    thermal_invoice_paper_width text,
    thermal_invoice_show_customer_phone boolean,
    thermal_invoice_show_payment_method boolean,
    thermal_invoice_show_note boolean,
    thermal_invoice_show_whatsapp boolean,
    thermal_invoice_show_instagram boolean,
    thermal_invoice_show_tiktok boolean,
    thermal_invoice_show_google_review boolean,
    thermal_invoice_show_map boolean
);


ALTER TABLE public.system_settings OWNER TO postgres;

--
-- TOC entry 398 (class 1259 OID 17889)
-- Name: tenants; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tenants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.tenants OWNER TO postgres;

--
-- TOC entry 399 (class 1259 OID 17896)
-- Name: vat_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.vat_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text DEFAULT 'VAT'::text,
    rate numeric DEFAULT 15 NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    branch_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid
);


ALTER TABLE public.vat_settings OWNER TO postgres;

--
-- TOC entry 4001 (class 2606 OID 17908)
-- Name: announcement_manual_customers announcement_manual_customers_announcement_id_customer_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.announcement_manual_customers
    ADD CONSTRAINT announcement_manual_customers_announcement_id_customer_id_key UNIQUE (announcement_id, customer_id);


--
-- TOC entry 4003 (class 2606 OID 17910)
-- Name: announcement_manual_customers announcement_manual_customers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.announcement_manual_customers
    ADD CONSTRAINT announcement_manual_customers_pkey PRIMARY KEY (id);


--
-- TOC entry 4007 (class 2606 OID 17912)
-- Name: announcement_recipients announcement_recipients_announcement_id_customer_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.announcement_recipients
    ADD CONSTRAINT announcement_recipients_announcement_id_customer_id_key UNIQUE (announcement_id, customer_id);


--
-- TOC entry 4009 (class 2606 OID 17914)
-- Name: announcement_recipients announcement_recipients_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.announcement_recipients
    ADD CONSTRAINT announcement_recipients_pkey PRIMARY KEY (id);


--
-- TOC entry 4013 (class 2606 OID 17916)
-- Name: announcements announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_pkey PRIMARY KEY (id);


--
-- TOC entry 4017 (class 2606 OID 17918)
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- TOC entry 4022 (class 2606 OID 17920)
-- Name: branch_catalog_items branch_catalog_items_branch_id_catalog_item_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.branch_catalog_items
    ADD CONSTRAINT branch_catalog_items_branch_id_catalog_item_id_key UNIQUE (branch_id, catalog_item_id);


--
-- TOC entry 4024 (class 2606 OID 17922)
-- Name: branch_catalog_items branch_catalog_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.branch_catalog_items
    ADD CONSTRAINT branch_catalog_items_pkey PRIMARY KEY (id);


--
-- TOC entry 4030 (class 2606 OID 17924)
-- Name: branch_whatsapp_configs branch_whatsapp_configs_branch_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.branch_whatsapp_configs
    ADD CONSTRAINT branch_whatsapp_configs_branch_id_key UNIQUE (branch_id);


--
-- TOC entry 4032 (class 2606 OID 17926)
-- Name: branch_whatsapp_configs branch_whatsapp_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.branch_whatsapp_configs
    ADD CONSTRAINT branch_whatsapp_configs_pkey PRIMARY KEY (id);


--
-- TOC entry 4034 (class 2606 OID 17928)
-- Name: branches branches_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_pkey PRIMARY KEY (id);


--
-- TOC entry 4039 (class 2606 OID 17930)
-- Name: catalog_categories catalog_categories_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.catalog_categories
    ADD CONSTRAINT catalog_categories_name_key UNIQUE (name);


--
-- TOC entry 4041 (class 2606 OID 17932)
-- Name: catalog_categories catalog_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.catalog_categories
    ADD CONSTRAINT catalog_categories_pkey PRIMARY KEY (id);


--
-- TOC entry 4043 (class 2606 OID 17934)
-- Name: catalog_items catalog_items_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.catalog_items
    ADD CONSTRAINT catalog_items_code_key UNIQUE (code);


--
-- TOC entry 4045 (class 2606 OID 17936)
-- Name: catalog_items catalog_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.catalog_items
    ADD CONSTRAINT catalog_items_pkey PRIMARY KEY (id);


--
-- TOC entry 4053 (class 2606 OID 17938)
-- Name: categories categories_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_name_key UNIQUE (name);


--
-- TOC entry 4055 (class 2606 OID 17940)
-- Name: categories categories_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);


--
-- TOC entry 4057 (class 2606 OID 17942)
-- Name: customers customers_phone_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_phone_key UNIQUE (phone);


--
-- TOC entry 4059 (class 2606 OID 17944)
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- TOC entry 4065 (class 2606 OID 17946)
-- Name: discounts discounts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.discounts
    ADD CONSTRAINT discounts_pkey PRIMARY KEY (id);


--
-- TOC entry 4068 (class 2606 OID 17948)
-- Name: inventory_movements inventory_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_pkey PRIMARY KEY (id);


--
-- TOC entry 4098 (class 2606 OID 17950)
-- Name: inventory_stock inventory_stock_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_stock
    ADD CONSTRAINT inventory_stock_pkey PRIMARY KEY (id);


--
-- TOC entry 4102 (class 2606 OID 17952)
-- Name: inventory_stock inventory_stock_tenant_id_branch_id_catalog_item_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_stock
    ADD CONSTRAINT inventory_stock_tenant_id_branch_id_catalog_item_id_key UNIQUE (tenant_id, branch_id, catalog_item_id);


--
-- TOC entry 4075 (class 2606 OID 17954)
-- Name: invoice_items invoice_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT invoice_items_pkey PRIMARY KEY (id);


--
-- TOC entry 4080 (class 2606 OID 17956)
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- TOC entry 4104 (class 2606 OID 17958)
-- Name: order_number_sequences order_number_sequences_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_number_sequences
    ADD CONSTRAINT order_number_sequences_pkey PRIMARY KEY (tenant_id, branch_id, sequence_month);


--
-- TOC entry 4106 (class 2606 OID 17960)
-- Name: order_status_logs order_status_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_status_logs
    ADD CONSTRAINT order_status_logs_pkey PRIMARY KEY (id);


--
-- TOC entry 4086 (class 2606 OID 17962)
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- TOC entry 4118 (class 2606 OID 18417)
-- Name: platform_admins platform_admins_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_pkey PRIMARY KEY (user_id);


--
-- TOC entry 4091 (class 2606 OID 17964)
-- Name: pos_profiles pos_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pos_profiles
    ADD CONSTRAINT pos_profiles_pkey PRIMARY KEY (id);


--
-- TOC entry 4094 (class 2606 OID 17966)
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- TOC entry 4108 (class 2606 OID 17968)
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (id);


--
-- TOC entry 4139 (class 2606 OID 18577)
-- Name: support_attachments support_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.support_attachments
    ADD CONSTRAINT support_attachments_pkey PRIMARY KEY (id);


--
-- TOC entry 4141 (class 2606 OID 18579)
-- Name: support_attachments support_attachments_storage_path_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.support_attachments
    ADD CONSTRAINT support_attachments_storage_path_key UNIQUE (storage_path);


--
-- TOC entry 4145 (class 2606 OID 18651)
-- Name: support_developer_notification_reads support_developer_notification_reads_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.support_developer_notification_reads
    ADD CONSTRAINT support_developer_notification_reads_pkey PRIMARY KEY (id);


--
-- TOC entry 4130 (class 2606 OID 18476)
-- Name: support_messages support_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.support_messages
    ADD CONSTRAINT support_messages_pkey PRIMARY KEY (id);


--
-- TOC entry 4135 (class 2606 OID 18495)
-- Name: support_ticket_events support_ticket_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.support_ticket_events
    ADD CONSTRAINT support_ticket_events_pkey PRIMARY KEY (id);


--
-- TOC entry 4122 (class 2606 OID 18442)
-- Name: support_tickets support_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);


--
-- TOC entry 4127 (class 2606 OID 18444)
-- Name: support_tickets support_tickets_ticket_number_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_ticket_number_key UNIQUE (ticket_number);


--
-- TOC entry 4110 (class 2606 OID 17970)
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (id);


--
-- TOC entry 4112 (class 2606 OID 17972)
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- TOC entry 4051 (class 2606 OID 17974)
-- Name: catalog_items unique_code; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.catalog_items
    ADD CONSTRAINT unique_code UNIQUE (code);


--
-- TOC entry 4116 (class 2606 OID 17976)
-- Name: vat_settings vat_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.vat_settings
    ADD CONSTRAINT vat_settings_pkey PRIMARY KEY (id);


--
-- TOC entry 4035 (class 1259 OID 17977)
-- Name: branches_tenant_code_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX branches_tenant_code_unique ON public.branches USING btree (tenant_id, code);


--
-- TOC entry 4061 (class 1259 OID 17978)
-- Name: discounts_branch_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX discounts_branch_id_idx ON public.discounts USING btree (branch_id);


--
-- TOC entry 4062 (class 1259 OID 17979)
-- Name: discounts_deleted_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX discounts_deleted_at_idx ON public.discounts USING btree (deleted_at);


--
-- TOC entry 4063 (class 1259 OID 17980)
-- Name: discounts_is_active_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX discounts_is_active_idx ON public.discounts USING btree (is_active);


--
-- TOC entry 4004 (class 1259 OID 17981)
-- Name: idx_announcement_manual_customers_announcement; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_announcement_manual_customers_announcement ON public.announcement_manual_customers USING btree (announcement_id);


--
-- TOC entry 4005 (class 1259 OID 17982)
-- Name: idx_announcement_manual_customers_tenant; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_announcement_manual_customers_tenant ON public.announcement_manual_customers USING btree (tenant_id);


--
-- TOC entry 4010 (class 1259 OID 17983)
-- Name: idx_announcement_recipients_announcement; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_announcement_recipients_announcement ON public.announcement_recipients USING btree (announcement_id);


--
-- TOC entry 4011 (class 1259 OID 17984)
-- Name: idx_announcement_recipients_tenant_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_announcement_recipients_tenant_status ON public.announcement_recipients USING btree (tenant_id, send_status);


--
-- TOC entry 4014 (class 1259 OID 17985)
-- Name: idx_announcements_tenant_branch; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_announcements_tenant_branch ON public.announcements USING btree (tenant_id, branch_id);


--
-- TOC entry 4015 (class 1259 OID 17986)
-- Name: idx_announcements_tenant_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_announcements_tenant_created ON public.announcements USING btree (tenant_id, created_at DESC);


--
-- TOC entry 4018 (class 1259 OID 17987)
-- Name: idx_audit_logs_actor_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_logs_actor_created ON public.audit_logs USING btree (actor_user_id, created_at DESC);


--
-- TOC entry 4019 (class 1259 OID 17988)
-- Name: idx_audit_logs_entity; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_logs_entity ON public.audit_logs USING btree (entity_type, entity_id);


--
-- TOC entry 4020 (class 1259 OID 17989)
-- Name: idx_audit_logs_tenant_created; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_audit_logs_tenant_created ON public.audit_logs USING btree (tenant_id, created_at DESC);


--
-- TOC entry 4025 (class 1259 OID 17990)
-- Name: idx_branch_catalog_items_branch; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_branch_catalog_items_branch ON public.branch_catalog_items USING btree (branch_id);


--
-- TOC entry 4026 (class 1259 OID 17991)
-- Name: idx_branch_catalog_items_branch_active_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_branch_catalog_items_branch_active_order ON public.branch_catalog_items USING btree (branch_id, is_active, display_order);


--
-- TOC entry 4027 (class 1259 OID 17992)
-- Name: idx_branch_catalog_items_branch_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_branch_catalog_items_branch_id ON public.branch_catalog_items USING btree (branch_id);


--
-- TOC entry 4028 (class 1259 OID 17993)
-- Name: idx_branch_catalog_items_catalog_item_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_branch_catalog_items_catalog_item_id ON public.branch_catalog_items USING btree (catalog_item_id);


--
-- TOC entry 4036 (class 1259 OID 17994)
-- Name: idx_branches_tenant_deleted_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_branches_tenant_deleted_at ON public.branches USING btree (tenant_id, deleted_at);


--
-- TOC entry 4037 (class 1259 OID 17995)
-- Name: idx_branches_tenant_order_number_prefix; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_branches_tenant_order_number_prefix ON public.branches USING btree (tenant_id, order_number_prefix) WHERE (order_number_prefix IS NOT NULL);


--
-- TOC entry 4046 (class 1259 OID 17996)
-- Name: idx_catalog_items_category; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_catalog_items_category ON public.catalog_items USING btree (category);


--
-- TOC entry 4047 (class 1259 OID 17997)
-- Name: idx_catalog_items_code; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_catalog_items_code ON public.catalog_items USING btree (code);


--
-- TOC entry 4048 (class 1259 OID 17998)
-- Name: idx_catalog_items_is_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_catalog_items_is_active ON public.catalog_items USING btree (is_active);


--
-- TOC entry 4049 (class 1259 OID 17999)
-- Name: idx_catalog_items_item_type; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_catalog_items_item_type ON public.catalog_items USING btree (item_type);


--
-- TOC entry 4060 (class 1259 OID 18000)
-- Name: idx_customers_branch_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_customers_branch_id ON public.customers USING btree (branch_id);


--
-- TOC entry 4073 (class 1259 OID 18001)
-- Name: idx_invoice_items_item_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_invoice_items_item_id ON public.invoice_items USING btree (item_id);


--
-- TOC entry 4076 (class 1259 OID 18002)
-- Name: idx_invoices_branch_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_invoices_branch_id ON public.invoices USING btree (branch_id);


--
-- TOC entry 4077 (class 1259 OID 18003)
-- Name: idx_invoices_tenant_branch_month_invoice_number_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_invoices_tenant_branch_month_invoice_number_unique ON public.invoices USING btree (tenant_id, branch_id, invoice_sequence_month, invoice_number) WHERE ((tenant_id IS NOT NULL) AND (branch_id IS NOT NULL) AND (invoice_number IS NOT NULL));


--
-- TOC entry 4081 (class 1259 OID 18004)
-- Name: idx_orders_branch_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_orders_branch_id ON public.orders USING btree (branch_id);


--
-- TOC entry 4082 (class 1259 OID 18005)
-- Name: idx_orders_tenant_branch_month_order_number_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_orders_tenant_branch_month_order_number_unique ON public.orders USING btree (tenant_id, branch_id, order_sequence_month, order_number) WHERE ((tenant_id IS NOT NULL) AND (branch_id IS NOT NULL) AND (order_number IS NOT NULL));


--
-- TOC entry 4087 (class 1259 OID 18006)
-- Name: idx_pos_profiles_branch_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pos_profiles_branch_id ON public.pos_profiles USING btree (branch_id);


--
-- TOC entry 4088 (class 1259 OID 18007)
-- Name: idx_pos_profiles_tenant_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pos_profiles_tenant_id ON public.pos_profiles USING btree (tenant_id);


--
-- TOC entry 4089 (class 1259 OID 18008)
-- Name: idx_pos_profiles_tenant_username; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_pos_profiles_tenant_username ON public.pos_profiles USING btree (tenant_id, lower(username));


--
-- TOC entry 4092 (class 1259 OID 18009)
-- Name: idx_profiles_branch_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_profiles_branch_id ON public.profiles USING btree (branch_id);


--
-- TOC entry 4066 (class 1259 OID 18010)
-- Name: inventory_movements_catalog_item_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX inventory_movements_catalog_item_idx ON public.inventory_movements USING btree (catalog_item_id);


--
-- TOC entry 4069 (class 1259 OID 18011)
-- Name: inventory_movements_tenant_branch_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX inventory_movements_tenant_branch_created_idx ON public.inventory_movements USING btree (tenant_id, branch_id, created_at DESC);


--
-- TOC entry 4070 (class 1259 OID 18012)
-- Name: inventory_movements_tenant_branch_item_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX inventory_movements_tenant_branch_item_created_idx ON public.inventory_movements USING btree (tenant_id, branch_id, catalog_item_id, created_at DESC);


--
-- TOC entry 4071 (class 1259 OID 18013)
-- Name: inventory_movements_tenant_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX inventory_movements_tenant_created_idx ON public.inventory_movements USING btree (tenant_id, created_at DESC);


--
-- TOC entry 4072 (class 1259 OID 18014)
-- Name: inventory_movements_tenant_source_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX inventory_movements_tenant_source_idx ON public.inventory_movements USING btree (tenant_id, source_type, source_id);


--
-- TOC entry 4099 (class 1259 OID 18015)
-- Name: inventory_stock_tenant_branch_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX inventory_stock_tenant_branch_idx ON public.inventory_stock USING btree (tenant_id, branch_id);


--
-- TOC entry 4100 (class 1259 OID 18016)
-- Name: inventory_stock_tenant_branch_item_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX inventory_stock_tenant_branch_item_idx ON public.inventory_stock USING btree (tenant_id, branch_id, catalog_item_id);


--
-- TOC entry 4078 (class 1259 OID 18017)
-- Name: invoices_monthly_invoice_number_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX invoices_monthly_invoice_number_unique ON public.invoices USING btree (tenant_id, branch_id, invoice_sequence_month, invoice_number) WHERE (invoice_number IS NOT NULL);


--
-- TOC entry 4083 (class 1259 OID 18018)
-- Name: orders_idempotency_key_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX orders_idempotency_key_unique ON public.orders USING btree (client_idempotency_key) WHERE (client_idempotency_key IS NOT NULL);


--
-- TOC entry 4084 (class 1259 OID 18019)
-- Name: orders_monthly_order_number_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX orders_monthly_order_number_unique ON public.orders USING btree (tenant_id, branch_id, order_sequence_month, order_number) WHERE (order_number IS NOT NULL);


--
-- TOC entry 4095 (class 1259 OID 18020)
-- Name: profiles_username_unique_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX profiles_username_unique_idx ON public.profiles USING btree (username);


--
-- TOC entry 4096 (class 1259 OID 18021)
-- Name: profiles_username_unique_lower_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX profiles_username_unique_lower_idx ON public.profiles USING btree (lower(username)) WHERE ((username IS NOT NULL) AND (TRIM(BOTH FROM username) <> ''::text));


--
-- TOC entry 4137 (class 1259 OID 18601)
-- Name: support_attachments_message_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX support_attachments_message_idx ON public.support_attachments USING btree (message_id) WHERE (message_id IS NOT NULL);


--
-- TOC entry 4142 (class 1259 OID 18600)
-- Name: support_attachments_ticket_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX support_attachments_ticket_created_idx ON public.support_attachments USING btree (ticket_id, created_at);


--
-- TOC entry 4143 (class 1259 OID 18668)
-- Name: support_developer_notification_reads_message_unique_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX support_developer_notification_reads_message_unique_idx ON public.support_developer_notification_reads USING btree (user_id, message_id) WHERE ((event_type = 'customer_reply'::text) AND (message_id IS NOT NULL));


--
-- TOC entry 4146 (class 1259 OID 18667)
-- Name: support_developer_notification_reads_ticket_unique_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX support_developer_notification_reads_ticket_unique_idx ON public.support_developer_notification_reads USING btree (user_id, ticket_id) WHERE ((event_type = 'ticket_created'::text) AND (message_id IS NULL));


--
-- TOC entry 4128 (class 1259 OID 18560)
-- Name: support_messages_id_ticket_uidx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX support_messages_id_ticket_uidx ON public.support_messages USING btree (id, ticket_id);


--
-- TOC entry 4131 (class 1259 OID 18639)
-- Name: support_messages_public_customer_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX support_messages_public_customer_created_idx ON public.support_messages USING btree (created_at DESC, id DESC, ticket_id) WHERE ((is_internal = false) AND (sender_type = 'customer'::text));


--
-- TOC entry 4132 (class 1259 OID 18535)
-- Name: support_messages_public_ticket_sender_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX support_messages_public_ticket_sender_created_idx ON public.support_messages USING btree (ticket_id, sender_type, created_at) WHERE (is_internal = false);


--
-- TOC entry 4133 (class 1259 OID 18509)
-- Name: support_messages_ticket_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX support_messages_ticket_created_idx ON public.support_messages USING btree (ticket_id, created_at);


--
-- TOC entry 4136 (class 1259 OID 18510)
-- Name: support_ticket_events_ticket_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX support_ticket_events_ticket_created_idx ON public.support_ticket_events USING btree (ticket_id, created_at);


--
-- TOC entry 4119 (class 1259 OID 18638)
-- Name: support_tickets_created_id_desc_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX support_tickets_created_id_desc_idx ON public.support_tickets USING btree (created_at DESC, id DESC);


--
-- TOC entry 4120 (class 1259 OID 18559)
-- Name: support_tickets_id_tenant_uidx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX support_tickets_id_tenant_uidx ON public.support_tickets USING btree (id, tenant_id);


--
-- TOC entry 4123 (class 1259 OID 18508)
-- Name: support_tickets_priority_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX support_tickets_priority_created_idx ON public.support_tickets USING btree (priority, created_at DESC);


--
-- TOC entry 4124 (class 1259 OID 18507)
-- Name: support_tickets_status_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX support_tickets_status_created_idx ON public.support_tickets USING btree (status, created_at DESC);


--
-- TOC entry 4125 (class 1259 OID 18506)
-- Name: support_tickets_tenant_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX support_tickets_tenant_created_idx ON public.support_tickets USING btree (tenant_id, created_at DESC);


--
-- TOC entry 4113 (class 1259 OID 18022)
-- Name: vat_settings_branch_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX vat_settings_branch_id_idx ON public.vat_settings USING btree (branch_id);


--
-- TOC entry 4114 (class 1259 OID 18023)
-- Name: vat_settings_is_active_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX vat_settings_is_active_idx ON public.vat_settings USING btree (is_active);


--
-- TOC entry 4211 (class 2620 OID 18515)
-- Name: platform_admins platform_admins_touch; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER platform_admins_touch BEFORE UPDATE ON public.platform_admins FOR EACH ROW EXECUTE FUNCTION public.touch_support_updated_at();


--
-- TOC entry 4198 (class 2620 OID 18024)
-- Name: customers set_customers_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER set_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- TOC entry 4200 (class 2620 OID 18025)
-- Name: discounts set_discounts_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER set_discounts_updated_at BEFORE UPDATE ON public.discounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- TOC entry 4202 (class 2620 OID 18026)
-- Name: invoices set_invoices_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER set_invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- TOC entry 4205 (class 2620 OID 18027)
-- Name: orders set_orders_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER set_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- TOC entry 4208 (class 2620 OID 18028)
-- Name: profiles set_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- TOC entry 4210 (class 2620 OID 18029)
-- Name: vat_settings set_vat_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER set_vat_updated_at BEFORE UPDATE ON public.vat_settings FOR EACH ROW EXECUTE FUNCTION public.set_vat_updated_at();


--
-- TOC entry 4213 (class 2620 OID 18514)
-- Name: support_messages support_messages_touch; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER support_messages_touch BEFORE UPDATE ON public.support_messages FOR EACH ROW EXECUTE FUNCTION public.touch_support_updated_at();


--
-- TOC entry 4212 (class 2620 OID 18513)
-- Name: support_tickets support_tickets_touch; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER support_tickets_touch BEFORE UPDATE ON public.support_tickets FOR EACH ROW EXECUTE FUNCTION public.touch_support_updated_at();


--
-- TOC entry 4201 (class 2620 OID 18030)
-- Name: invoice_items trg_deduct_inventory_on_invoice_item_insert; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_deduct_inventory_on_invoice_item_insert AFTER INSERT ON public.invoice_items FOR EACH ROW EXECUTE FUNCTION public.deduct_inventory_on_invoice_item_insert();


--
-- TOC entry 4199 (class 2620 OID 18031)
-- Name: customers trg_set_customers_branch_id; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_set_customers_branch_id BEFORE INSERT ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_customers_branch_id();


--
-- TOC entry 4203 (class 2620 OID 18032)
-- Name: invoices trg_set_invoices_branch_id; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_set_invoices_branch_id BEFORE INSERT ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.set_invoices_branch_id();


--
-- TOC entry 4206 (class 2620 OID 18033)
-- Name: orders trg_set_orders_branch_id; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_set_orders_branch_id BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_orders_branch_id();


--
-- TOC entry 4209 (class 2620 OID 18034)
-- Name: system_settings trg_system_settings_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_system_settings_updated_at BEFORE UPDATE ON public.system_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_system_settings();


--
-- TOC entry 4204 (class 2620 OID 18035)
-- Name: invoices trg_zzzz_set_invoice_number_from_order; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_zzzz_set_invoice_number_from_order BEFORE INSERT ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.set_invoice_number_from_order();


--
-- TOC entry 4207 (class 2620 OID 18036)
-- Name: orders trg_zzzz_set_order_number_branch_monthly; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_zzzz_set_order_number_branch_monthly BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_order_number_branch_monthly();


--
-- TOC entry 4147 (class 2606 OID 18037)
-- Name: announcement_manual_customers announcement_manual_customers_announcement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.announcement_manual_customers
    ADD CONSTRAINT announcement_manual_customers_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES public.announcements(id) ON DELETE CASCADE;


--
-- TOC entry 4148 (class 2606 OID 18042)
-- Name: announcement_manual_customers announcement_manual_customers_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.announcement_manual_customers
    ADD CONSTRAINT announcement_manual_customers_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- TOC entry 4149 (class 2606 OID 18047)
-- Name: announcement_recipients announcement_recipients_announcement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.announcement_recipients
    ADD CONSTRAINT announcement_recipients_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES public.announcements(id) ON DELETE CASCADE;


--
-- TOC entry 4150 (class 2606 OID 18052)
-- Name: announcement_recipients announcement_recipients_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.announcement_recipients
    ADD CONSTRAINT announcement_recipients_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- TOC entry 4151 (class 2606 OID 18057)
-- Name: audit_logs audit_logs_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- TOC entry 4152 (class 2606 OID 18062)
-- Name: audit_logs audit_logs_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;


--
-- TOC entry 4153 (class 2606 OID 18067)
-- Name: audit_logs audit_logs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE SET NULL;


--
-- TOC entry 4154 (class 2606 OID 18072)
-- Name: branch_catalog_items branch_catalog_items_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.branch_catalog_items
    ADD CONSTRAINT branch_catalog_items_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- TOC entry 4155 (class 2606 OID 18077)
-- Name: branch_catalog_items branch_catalog_items_catalog_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.branch_catalog_items
    ADD CONSTRAINT branch_catalog_items_catalog_item_id_fkey FOREIGN KEY (catalog_item_id) REFERENCES public.catalog_items(id) ON DELETE CASCADE;


--
-- TOC entry 4156 (class 2606 OID 18082)
-- Name: branch_whatsapp_configs branch_whatsapp_configs_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.branch_whatsapp_configs
    ADD CONSTRAINT branch_whatsapp_configs_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- TOC entry 4157 (class 2606 OID 18087)
-- Name: customers customers_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;


--
-- TOC entry 4158 (class 2606 OID 18092)
-- Name: customers customers_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- TOC entry 4159 (class 2606 OID 18097)
-- Name: inventory_movements inventory_movements_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- TOC entry 4160 (class 2606 OID 18102)
-- Name: inventory_movements inventory_movements_catalog_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_catalog_item_id_fkey FOREIGN KEY (catalog_item_id) REFERENCES public.catalog_items(id) ON DELETE RESTRICT;


--
-- TOC entry 4161 (class 2606 OID 18107)
-- Name: inventory_movements inventory_movements_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_movements
    ADD CONSTRAINT inventory_movements_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- TOC entry 4176 (class 2606 OID 18112)
-- Name: inventory_stock inventory_stock_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_stock
    ADD CONSTRAINT inventory_stock_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;


--
-- TOC entry 4177 (class 2606 OID 18117)
-- Name: inventory_stock inventory_stock_catalog_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_stock
    ADD CONSTRAINT inventory_stock_catalog_item_id_fkey FOREIGN KEY (catalog_item_id) REFERENCES public.catalog_items(id) ON DELETE CASCADE;


--
-- TOC entry 4178 (class 2606 OID 18122)
-- Name: inventory_stock inventory_stock_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inventory_stock
    ADD CONSTRAINT inventory_stock_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- TOC entry 4162 (class 2606 OID 18127)
-- Name: invoice_items invoice_items_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;


--
-- TOC entry 4163 (class 2606 OID 18132)
-- Name: invoice_items invoice_items_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT invoice_items_item_id_fkey FOREIGN KEY (item_id) REFERENCES public.catalog_items(id) ON DELETE SET NULL;


--
-- TOC entry 4164 (class 2606 OID 18137)
-- Name: invoices invoices_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;


--
-- TOC entry 4165 (class 2606 OID 18142)
-- Name: invoices invoices_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- TOC entry 4166 (class 2606 OID 18147)
-- Name: invoices invoices_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE RESTRICT;


--
-- TOC entry 4167 (class 2606 OID 18152)
-- Name: invoices invoices_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- TOC entry 4179 (class 2606 OID 18157)
-- Name: order_number_sequences order_number_sequences_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_number_sequences
    ADD CONSTRAINT order_number_sequences_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- TOC entry 4180 (class 2606 OID 18162)
-- Name: order_status_logs order_status_logs_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_status_logs
    ADD CONSTRAINT order_status_logs_changed_by_fkey FOREIGN KEY (changed_by) REFERENCES public.profiles(id);


--
-- TOC entry 4181 (class 2606 OID 18167)
-- Name: order_status_logs order_status_logs_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.order_status_logs
    ADD CONSTRAINT order_status_logs_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- TOC entry 4168 (class 2606 OID 18172)
-- Name: orders orders_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;


--
-- TOC entry 4169 (class 2606 OID 18177)
-- Name: orders orders_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- TOC entry 4170 (class 2606 OID 18182)
-- Name: orders orders_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE RESTRICT;


--
-- TOC entry 4182 (class 2606 OID 18418)
-- Name: platform_admins platform_admins_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 4171 (class 2606 OID 18187)
-- Name: pos_profiles pos_profiles_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pos_profiles
    ADD CONSTRAINT pos_profiles_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;


--
-- TOC entry 4172 (class 2606 OID 18192)
-- Name: pos_profiles pos_profiles_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pos_profiles
    ADD CONSTRAINT pos_profiles_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- TOC entry 4173 (class 2606 OID 18197)
-- Name: pos_profiles pos_profiles_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pos_profiles
    ADD CONSTRAINT pos_profiles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- TOC entry 4174 (class 2606 OID 18202)
-- Name: profiles profiles_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;


--
-- TOC entry 4175 (class 2606 OID 18207)
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- TOC entry 4191 (class 2606 OID 18595)
-- Name: support_attachments support_attachments_message_ticket_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.support_attachments
    ADD CONSTRAINT support_attachments_message_ticket_fk FOREIGN KEY (message_id, ticket_id) REFERENCES public.support_messages(id, ticket_id) ON DELETE CASCADE;


--
-- TOC entry 4192 (class 2606 OID 18580)
-- Name: support_attachments support_attachments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.support_attachments
    ADD CONSTRAINT support_attachments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- TOC entry 4193 (class 2606 OID 18590)
-- Name: support_attachments support_attachments_ticket_tenant_fk; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.support_attachments
    ADD CONSTRAINT support_attachments_ticket_tenant_fk FOREIGN KEY (ticket_id, tenant_id) REFERENCES public.support_tickets(id, tenant_id) ON DELETE CASCADE;


--
-- TOC entry 4194 (class 2606 OID 18585)
-- Name: support_attachments support_attachments_uploaded_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.support_attachments
    ADD CONSTRAINT support_attachments_uploaded_by_user_id_fkey FOREIGN KEY (uploaded_by_user_id) REFERENCES auth.users(id) ON DELETE RESTRICT;


--
-- TOC entry 4195 (class 2606 OID 18662)
-- Name: support_developer_notification_reads support_developer_notification_reads_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.support_developer_notification_reads
    ADD CONSTRAINT support_developer_notification_reads_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.support_messages(id) ON DELETE CASCADE;


--
-- TOC entry 4196 (class 2606 OID 18657)
-- Name: support_developer_notification_reads support_developer_notification_reads_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.support_developer_notification_reads
    ADD CONSTRAINT support_developer_notification_reads_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id) ON DELETE CASCADE;


--
-- TOC entry 4197 (class 2606 OID 18652)
-- Name: support_developer_notification_reads support_developer_notification_reads_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.support_developer_notification_reads
    ADD CONSTRAINT support_developer_notification_reads_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.platform_admins(user_id) ON DELETE CASCADE;


--
-- TOC entry 4187 (class 2606 OID 18482)
-- Name: support_messages support_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.support_messages
    ADD CONSTRAINT support_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id);


--
-- TOC entry 4188 (class 2606 OID 18477)
-- Name: support_messages support_messages_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.support_messages
    ADD CONSTRAINT support_messages_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id) ON DELETE CASCADE;


--
-- TOC entry 4189 (class 2606 OID 18501)
-- Name: support_ticket_events support_ticket_events_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.support_ticket_events
    ADD CONSTRAINT support_ticket_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES auth.users(id);


--
-- TOC entry 4190 (class 2606 OID 18496)
-- Name: support_ticket_events support_ticket_events_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.support_ticket_events
    ADD CONSTRAINT support_ticket_events_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.support_tickets(id) ON DELETE CASCADE;


--
-- TOC entry 4183 (class 2606 OID 18460)
-- Name: support_tickets support_tickets_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.platform_admins(user_id) ON DELETE SET NULL;


--
-- TOC entry 4184 (class 2606 OID 18450)
-- Name: support_tickets support_tickets_branch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE SET NULL;


--
-- TOC entry 4185 (class 2606 OID 18455)
-- Name: support_tickets support_tickets_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- TOC entry 4186 (class 2606 OID 18445)
-- Name: support_tickets support_tickets_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- TOC entry 4394 (class 3256 OID 18212)
-- Name: categories admins manage categories; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "admins manage categories" ON public.categories USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- TOC entry 4395 (class 3256 OID 18213)
-- Name: settings admins update settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "admins update settings" ON public.settings FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());


--
-- TOC entry 4363 (class 0 OID 17635)
-- Dependencies: 372
-- Name: announcement_manual_customers; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.announcement_manual_customers ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4364 (class 0 OID 17640)
-- Dependencies: 373
-- Name: announcement_recipients; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.announcement_recipients ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4365 (class 0 OID 17649)
-- Dependencies: 374
-- Name: announcements; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4366 (class 0 OID 17662)
-- Dependencies: 375
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4396 (class 3256 OID 18214)
-- Name: audit_logs audit_logs_select_same_tenant_admin; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY audit_logs_select_same_tenant_admin ON public.audit_logs FOR SELECT TO authenticated USING ((tenant_id IN ( SELECT p.tenant_id
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::text, 'manager'::text])) AND (p.is_active = true)))));


--
-- TOC entry 4397 (class 3256 OID 18215)
-- Name: customers authenticated can insert customers; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "authenticated can insert customers" ON public.customers FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- TOC entry 4398 (class 3256 OID 18216)
-- Name: invoice_items authenticated can insert invoice_items; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "authenticated can insert invoice_items" ON public.invoice_items FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- TOC entry 4399 (class 3256 OID 18217)
-- Name: invoices authenticated can insert invoices; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "authenticated can insert invoices" ON public.invoices FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- TOC entry 4400 (class 3256 OID 18218)
-- Name: orders authenticated can insert orders; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "authenticated can insert orders" ON public.orders FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- TOC entry 4401 (class 3256 OID 18219)
-- Name: order_status_logs authenticated can insert status logs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "authenticated can insert status logs" ON public.order_status_logs FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- TOC entry 4402 (class 3256 OID 18220)
-- Name: customers authenticated can update customers; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "authenticated can update customers" ON public.customers FOR UPDATE USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- TOC entry 4403 (class 3256 OID 18221)
-- Name: invoice_items authenticated can update invoice_items; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "authenticated can update invoice_items" ON public.invoice_items FOR UPDATE USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- TOC entry 4404 (class 3256 OID 18222)
-- Name: invoices authenticated can update invoices; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "authenticated can update invoices" ON public.invoices FOR UPDATE USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- TOC entry 4405 (class 3256 OID 18223)
-- Name: orders authenticated can update orders; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "authenticated can update orders" ON public.orders FOR UPDATE USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- TOC entry 4406 (class 3256 OID 18224)
-- Name: categories authenticated can view categories; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "authenticated can view categories" ON public.categories FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- TOC entry 4407 (class 3256 OID 18225)
-- Name: customers authenticated can view customers; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "authenticated can view customers" ON public.customers FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- TOC entry 4408 (class 3256 OID 18226)
-- Name: invoice_items authenticated can view invoice_items; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "authenticated can view invoice_items" ON public.invoice_items FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- TOC entry 4409 (class 3256 OID 18227)
-- Name: invoices authenticated can view invoices; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "authenticated can view invoices" ON public.invoices FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- TOC entry 4410 (class 3256 OID 18228)
-- Name: orders authenticated can view orders; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "authenticated can view orders" ON public.orders FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- TOC entry 4411 (class 3256 OID 18229)
-- Name: settings authenticated can view settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "authenticated can view settings" ON public.settings FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- TOC entry 4412 (class 3256 OID 18230)
-- Name: order_status_logs authenticated can view status logs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "authenticated can view status logs" ON public.order_status_logs FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- TOC entry 4367 (class 0 OID 17670)
-- Dependencies: 376
-- Name: branch_catalog_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.branch_catalog_items ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4413 (class 3256 OID 18231)
-- Name: branch_catalog_items branch_catalog_items_insert_same_tenant; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY branch_catalog_items_insert_same_tenant ON public.branch_catalog_items FOR INSERT TO authenticated WITH CHECK ((tenant_id = public.current_profile_tenant_id()));


--
-- TOC entry 4414 (class 3256 OID 18232)
-- Name: branch_catalog_items branch_catalog_items_select_same_tenant; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY branch_catalog_items_select_same_tenant ON public.branch_catalog_items FOR SELECT TO authenticated USING ((tenant_id = public.current_profile_tenant_id()));


--
-- TOC entry 4416 (class 3256 OID 18233)
-- Name: branch_catalog_items branch_catalog_items_update_same_tenant; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY branch_catalog_items_update_same_tenant ON public.branch_catalog_items FOR UPDATE TO authenticated USING ((tenant_id = public.current_profile_tenant_id())) WITH CHECK ((tenant_id = public.current_profile_tenant_id()));


--
-- TOC entry 4368 (class 0 OID 17679)
-- Dependencies: 377
-- Name: branch_whatsapp_configs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.branch_whatsapp_configs ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4417 (class 3256 OID 18234)
-- Name: branch_whatsapp_configs branch_whatsapp_configs_insert_same_tenant; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY branch_whatsapp_configs_insert_same_tenant ON public.branch_whatsapp_configs FOR INSERT TO authenticated WITH CHECK ((tenant_id = public.current_profile_tenant_id()));


--
-- TOC entry 4418 (class 3256 OID 18235)
-- Name: branch_whatsapp_configs branch_whatsapp_configs_select_same_tenant; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY branch_whatsapp_configs_select_same_tenant ON public.branch_whatsapp_configs FOR SELECT TO authenticated USING ((tenant_id = public.current_profile_tenant_id()));


--
-- TOC entry 4419 (class 3256 OID 18236)
-- Name: branch_whatsapp_configs branch_whatsapp_configs_update_same_tenant; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY branch_whatsapp_configs_update_same_tenant ON public.branch_whatsapp_configs FOR UPDATE TO authenticated USING ((tenant_id = public.current_profile_tenant_id())) WITH CHECK ((tenant_id = public.current_profile_tenant_id()));


--
-- TOC entry 4369 (class 0 OID 17689)
-- Dependencies: 378
-- Name: branches; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4420 (class 3256 OID 18237)
-- Name: branches branches_insert_same_tenant; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY branches_insert_same_tenant ON public.branches FOR INSERT TO authenticated WITH CHECK ((tenant_id = public.current_profile_tenant_id()));


--
-- TOC entry 4421 (class 3256 OID 18238)
-- Name: branches branches_select_same_tenant; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY branches_select_same_tenant ON public.branches FOR SELECT TO authenticated USING ((tenant_id = public.current_profile_tenant_id()));


--
-- TOC entry 4422 (class 3256 OID 18239)
-- Name: branches branches_update_same_tenant; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY branches_update_same_tenant ON public.branches FOR UPDATE TO authenticated USING ((tenant_id = public.current_profile_tenant_id())) WITH CHECK ((tenant_id = public.current_profile_tenant_id()));


--
-- TOC entry 4370 (class 0 OID 17698)
-- Dependencies: 379
-- Name: catalog_categories; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.catalog_categories ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4423 (class 3256 OID 18240)
-- Name: catalog_categories catalog_categories_insert_same_tenant; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY catalog_categories_insert_same_tenant ON public.catalog_categories FOR INSERT TO authenticated WITH CHECK ((tenant_id = public.current_profile_tenant_id()));


--
-- TOC entry 4424 (class 3256 OID 18241)
-- Name: catalog_categories catalog_categories_select_same_tenant; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY catalog_categories_select_same_tenant ON public.catalog_categories FOR SELECT TO authenticated USING ((tenant_id = public.current_profile_tenant_id()));


--
-- TOC entry 4425 (class 3256 OID 18242)
-- Name: catalog_categories catalog_categories_update_same_tenant; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY catalog_categories_update_same_tenant ON public.catalog_categories FOR UPDATE TO authenticated USING ((tenant_id = public.current_profile_tenant_id())) WITH CHECK ((tenant_id = public.current_profile_tenant_id()));


--
-- TOC entry 4371 (class 0 OID 17708)
-- Dependencies: 380
-- Name: catalog_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.catalog_items ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4426 (class 3256 OID 18243)
-- Name: catalog_items catalog_items_insert_same_tenant; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY catalog_items_insert_same_tenant ON public.catalog_items FOR INSERT TO authenticated WITH CHECK ((tenant_id = public.current_profile_tenant_id()));


--
-- TOC entry 4415 (class 3256 OID 18244)
-- Name: catalog_items catalog_items_select_same_tenant; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY catalog_items_select_same_tenant ON public.catalog_items FOR SELECT TO authenticated USING ((tenant_id = public.current_profile_tenant_id()));


--
-- TOC entry 4427 (class 3256 OID 18245)
-- Name: catalog_items catalog_items_update_same_tenant; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY catalog_items_update_same_tenant ON public.catalog_items FOR UPDATE TO authenticated USING ((tenant_id = public.current_profile_tenant_id())) WITH CHECK ((tenant_id = public.current_profile_tenant_id()));


--
-- TOC entry 4372 (class 0 OID 17722)
-- Dependencies: 381
-- Name: categories; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4373 (class 0 OID 17732)
-- Dependencies: 382
-- Name: customers; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4428 (class 3256 OID 18246)
-- Name: customers customers_insert_same_tenant; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY customers_insert_same_tenant ON public.customers FOR INSERT TO authenticated WITH CHECK ((tenant_id = public.current_profile_tenant_id()));


--
-- TOC entry 4429 (class 3256 OID 18247)
-- Name: customers customers_select_same_tenant; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY customers_select_same_tenant ON public.customers FOR SELECT TO authenticated USING ((tenant_id = public.current_profile_tenant_id()));


--
-- TOC entry 4430 (class 3256 OID 18248)
-- Name: customers customers_update_same_tenant; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY customers_update_same_tenant ON public.customers FOR UPDATE TO authenticated USING ((tenant_id = public.current_profile_tenant_id())) WITH CHECK ((tenant_id = public.current_profile_tenant_id()));


--
-- TOC entry 4374 (class 0 OID 17740)
-- Dependencies: 383
-- Name: discounts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.discounts ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4431 (class 3256 OID 18249)
-- Name: discounts discounts_insert_same_tenant; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY discounts_insert_same_tenant ON public.discounts FOR INSERT TO authenticated WITH CHECK ((tenant_id = public.current_profile_tenant_id()));


--
-- TOC entry 4432 (class 3256 OID 18250)
-- Name: discounts discounts_select_same_tenant; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY discounts_select_same_tenant ON public.discounts FOR SELECT TO authenticated USING ((tenant_id = public.current_profile_tenant_id()));


--
-- TOC entry 4433 (class 3256 OID 18251)
-- Name: discounts discounts_update_same_tenant; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY discounts_update_same_tenant ON public.discounts FOR UPDATE TO authenticated USING ((tenant_id = public.current_profile_tenant_id())) WITH CHECK ((tenant_id = public.current_profile_tenant_id()));


--
-- TOC entry 4375 (class 0 OID 17751)
-- Dependencies: 384
-- Name: inventory_movements; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4381 (class 0 OID 17834)
-- Dependencies: 391
-- Name: inventory_stock; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.inventory_stock ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4376 (class 0 OID 17759)
-- Dependencies: 385
-- Name: invoice_items; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4434 (class 3256 OID 18252)
-- Name: invoice_items invoice_items_insert_same_tenant; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY invoice_items_insert_same_tenant ON public.invoice_items FOR INSERT TO authenticated WITH CHECK ((tenant_id = public.current_profile_tenant_id()));


--
-- TOC entry 4435 (class 3256 OID 18253)
-- Name: invoice_items invoice_items_select_same_tenant; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY invoice_items_select_same_tenant ON public.invoice_items FOR SELECT TO authenticated USING ((tenant_id = public.current_profile_tenant_id()));


--
-- TOC entry 4436 (class 3256 OID 18254)
-- Name: invoice_items invoice_items_update_same_tenant; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY invoice_items_update_same_tenant ON public.invoice_items FOR UPDATE TO authenticated USING ((tenant_id = public.current_profile_tenant_id())) WITH CHECK ((tenant_id = public.current_profile_tenant_id()));


--
-- TOC entry 4377 (class 0 OID 17771)
-- Dependencies: 386
-- Name: invoices; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4437 (class 3256 OID 18255)
-- Name: invoices invoices_insert_same_tenant; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY invoices_insert_same_tenant ON public.invoices FOR INSERT TO authenticated WITH CHECK ((tenant_id = public.current_profile_tenant_id()));


--
-- TOC entry 4438 (class 3256 OID 18256)
-- Name: invoices invoices_select_same_tenant; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY invoices_select_same_tenant ON public.invoices FOR SELECT TO authenticated USING ((tenant_id = public.current_profile_tenant_id()));


--
-- TOC entry 4439 (class 3256 OID 18257)
-- Name: invoices invoices_update_same_tenant; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY invoices_update_same_tenant ON public.invoices FOR UPDATE TO authenticated USING ((tenant_id = public.current_profile_tenant_id())) WITH CHECK ((tenant_id = public.current_profile_tenant_id()));


--
-- TOC entry 4382 (class 0 OID 17846)
-- Dependencies: 394
-- Name: order_number_sequences; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.order_number_sequences ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4383 (class 0 OID 17851)
-- Dependencies: 395
-- Name: order_status_logs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.order_status_logs ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4378 (class 0 OID 17791)
-- Dependencies: 387
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4440 (class 3256 OID 18258)
-- Name: orders orders_insert_same_tenant; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY orders_insert_same_tenant ON public.orders FOR INSERT TO authenticated WITH CHECK ((tenant_id = public.current_profile_tenant_id()));


--
-- TOC entry 4441 (class 3256 OID 18259)
-- Name: orders orders_select_same_tenant; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY orders_select_same_tenant ON public.orders FOR SELECT TO authenticated USING ((tenant_id = public.current_profile_tenant_id()));


--
-- TOC entry 4442 (class 3256 OID 18260)
-- Name: orders orders_update_same_tenant; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY orders_update_same_tenant ON public.orders FOR UPDATE TO authenticated USING ((tenant_id = public.current_profile_tenant_id())) WITH CHECK ((tenant_id = public.current_profile_tenant_id()));


--
-- TOC entry 4388 (class 0 OID 18407)
-- Dependencies: 400
-- Name: platform_admins; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4456 (class 3256 OID 18516)
-- Name: platform_admins platform_admins_self_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY platform_admins_self_select ON public.platform_admins FOR SELECT TO authenticated USING (((user_id = auth.uid()) AND is_active));


--
-- TOC entry 4379 (class 0 OID 17804)
-- Dependencies: 388
-- Name: pos_profiles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.pos_profiles ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4443 (class 3256 OID 18261)
-- Name: pos_profiles pos_profiles_select_same_tenant_system_user; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY pos_profiles_select_same_tenant_system_user ON public.pos_profiles FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.tenant_id = pos_profiles.tenant_id) AND (COALESCE(p.is_active, true) = true) AND ((p.role = ANY (ARRAY['owner'::text, 'admin'::text, 'manager'::text])) OR ((p.role = 'employee'::text) AND (p.branch_id IS NOT NULL) AND (p.branch_id = pos_profiles.branch_id)))))));


--
-- TOC entry 4380 (class 0 OID 17816)
-- Dependencies: 389
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4444 (class 3256 OID 18262)
-- Name: profiles profiles_select_admin_override; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY profiles_select_admin_override ON public.profiles FOR SELECT TO authenticated USING (((tenant_id = public.current_profile_tenant_id()) AND (public.current_profile_role() = 'admin'::text)));


--
-- TOC entry 4445 (class 3256 OID 18263)
-- Name: profiles profiles_select_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY profiles_select_own ON public.profiles FOR SELECT TO authenticated USING ((auth.uid() = id));


--
-- TOC entry 4446 (class 3256 OID 18264)
-- Name: profiles profiles_select_same_tenant; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY profiles_select_same_tenant ON public.profiles FOR SELECT TO authenticated USING ((tenant_id = public.current_profile_tenant_id()));


--
-- TOC entry 4447 (class 3256 OID 18265)
-- Name: profiles profiles_select_self; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY profiles_select_self ON public.profiles FOR SELECT TO authenticated USING ((id = auth.uid()));


--
-- TOC entry 4448 (class 3256 OID 18266)
-- Name: profiles profiles_update_own; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));


--
-- TOC entry 4449 (class 3256 OID 18267)
-- Name: profiles profiles_update_self; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY profiles_update_self ON public.profiles FOR UPDATE TO authenticated USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));


--
-- TOC entry 4384 (class 0 OID 17858)
-- Dependencies: 396
-- Name: settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4392 (class 0 OID 18561)
-- Dependencies: 405
-- Name: support_attachments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.support_attachments ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4393 (class 0 OID 18640)
-- Dependencies: 406
-- Name: support_developer_notification_reads; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.support_developer_notification_reads ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4459 (class 3256 OID 18519)
-- Name: support_ticket_events support_events_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY support_events_select ON public.support_ticket_events FOR SELECT TO authenticated USING (public.is_active_platform_admin());


--
-- TOC entry 4390 (class 0 OID 18465)
-- Dependencies: 403
-- Name: support_messages; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4458 (class 3256 OID 18518)
-- Name: support_messages support_messages_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY support_messages_select ON public.support_messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.support_tickets
  WHERE ((support_tickets.id = support_messages.ticket_id) AND (public.is_active_platform_admin() OR ((support_tickets.tenant_id = public.current_profile_tenant_id()) AND (NOT support_messages.is_internal)))))));


--
-- TOC entry 4391 (class 0 OID 18487)
-- Dependencies: 404
-- Name: support_ticket_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.support_ticket_events ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4389 (class 0 OID 18424)
-- Dependencies: 402
-- Name: support_tickets; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4457 (class 3256 OID 18517)
-- Name: support_tickets support_tickets_select; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY support_tickets_select ON public.support_tickets FOR SELECT TO authenticated USING ((public.is_active_platform_admin() OR (tenant_id = public.current_profile_tenant_id())));


--
-- TOC entry 4385 (class 0 OID 17866)
-- Dependencies: 397
-- Name: system_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4450 (class 3256 OID 18268)
-- Name: system_settings system_settings_insert_same_tenant; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY system_settings_insert_same_tenant ON public.system_settings FOR INSERT TO authenticated WITH CHECK ((tenant_id = public.current_profile_tenant_id()));


--
-- TOC entry 4451 (class 3256 OID 18269)
-- Name: system_settings system_settings_select_same_tenant; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY system_settings_select_same_tenant ON public.system_settings FOR SELECT TO authenticated USING ((tenant_id = public.current_profile_tenant_id()));


--
-- TOC entry 4452 (class 3256 OID 18270)
-- Name: system_settings system_settings_update_same_tenant; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY system_settings_update_same_tenant ON public.system_settings FOR UPDATE TO authenticated USING ((tenant_id = public.current_profile_tenant_id())) WITH CHECK ((tenant_id = public.current_profile_tenant_id()));


--
-- TOC entry 4386 (class 0 OID 17889)
-- Dependencies: 398
-- Name: tenants; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4387 (class 0 OID 17896)
-- Dependencies: 399
-- Name: vat_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.vat_settings ENABLE ROW LEVEL SECURITY;

--
-- TOC entry 4453 (class 3256 OID 18271)
-- Name: vat_settings vat_settings_insert_same_tenant; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY vat_settings_insert_same_tenant ON public.vat_settings FOR INSERT TO authenticated WITH CHECK ((tenant_id = public.current_profile_tenant_id()));


--
-- TOC entry 4454 (class 3256 OID 18272)
-- Name: vat_settings vat_settings_select_same_tenant; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY vat_settings_select_same_tenant ON public.vat_settings FOR SELECT TO authenticated USING ((tenant_id = public.current_profile_tenant_id()));


--
-- TOC entry 4455 (class 3256 OID 18273)
-- Name: vat_settings vat_settings_update_same_tenant; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY vat_settings_update_same_tenant ON public.vat_settings FOR UPDATE TO authenticated USING ((tenant_id = public.current_profile_tenant_id())) WITH CHECK ((tenant_id = public.current_profile_tenant_id()));


--
-- TOC entry 4467 (class 0 OID 0)
-- Dependencies: 17
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- TOC entry 4468 (class 0 OID 0)
-- Dependencies: 517
-- Name: FUNCTION adjust_inventory_stock(p_tenant_id uuid, p_branch_id uuid, p_catalog_item_id uuid, p_quantity_delta numeric, p_movement_type text, p_notes text, p_created_by uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.adjust_inventory_stock(p_tenant_id uuid, p_branch_id uuid, p_catalog_item_id uuid, p_quantity_delta numeric, p_movement_type text, p_notes text, p_created_by uuid) TO anon;
GRANT ALL ON FUNCTION public.adjust_inventory_stock(p_tenant_id uuid, p_branch_id uuid, p_catalog_item_id uuid, p_quantity_delta numeric, p_movement_type text, p_notes text, p_created_by uuid) TO authenticated;
GRANT ALL ON FUNCTION public.adjust_inventory_stock(p_tenant_id uuid, p_branch_id uuid, p_catalog_item_id uuid, p_quantity_delta numeric, p_movement_type text, p_notes text, p_created_by uuid) TO service_role;


--
-- TOC entry 4469 (class 0 OID 0)
-- Dependencies: 518
-- Name: FUNCTION afex_can_pos(p_role text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.afex_can_pos(p_role text) TO anon;
GRANT ALL ON FUNCTION public.afex_can_pos(p_role text) TO authenticated;
GRANT ALL ON FUNCTION public.afex_can_pos(p_role text) TO service_role;


--
-- TOC entry 4470 (class 0 OID 0)
-- Dependencies: 519
-- Name: FUNCTION afex_is_employee(p_role text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.afex_is_employee(p_role text) TO anon;
GRANT ALL ON FUNCTION public.afex_is_employee(p_role text) TO authenticated;
GRANT ALL ON FUNCTION public.afex_is_employee(p_role text) TO service_role;


--
-- TOC entry 4471 (class 0 OID 0)
-- Dependencies: 520
-- Name: FUNCTION afex_is_full_admin(p_role text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.afex_is_full_admin(p_role text) TO anon;
GRANT ALL ON FUNCTION public.afex_is_full_admin(p_role text) TO authenticated;
GRANT ALL ON FUNCTION public.afex_is_full_admin(p_role text) TO service_role;


--
-- TOC entry 4472 (class 0 OID 0)
-- Dependencies: 521
-- Name: FUNCTION create_invoice_with_items(p_invoice jsonb, p_items jsonb); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.create_invoice_with_items(p_invoice jsonb, p_items jsonb) TO anon;
GRANT ALL ON FUNCTION public.create_invoice_with_items(p_invoice jsonb, p_items jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.create_invoice_with_items(p_invoice jsonb, p_items jsonb) TO service_role;


--
-- TOC entry 4473 (class 0 OID 0)
-- Dependencies: 522
-- Name: FUNCTION create_invoice_with_items(p_customer_name text, p_customer_phone text, p_customer_notes text, p_payment_method text, p_discount numeric, p_tax numeric, p_note text, p_items json); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.create_invoice_with_items(p_customer_name text, p_customer_phone text, p_customer_notes text, p_payment_method text, p_discount numeric, p_tax numeric, p_note text, p_items json) TO anon;
GRANT ALL ON FUNCTION public.create_invoice_with_items(p_customer_name text, p_customer_phone text, p_customer_notes text, p_payment_method text, p_discount numeric, p_tax numeric, p_note text, p_items json) TO authenticated;
GRANT ALL ON FUNCTION public.create_invoice_with_items(p_customer_name text, p_customer_phone text, p_customer_notes text, p_payment_method text, p_discount numeric, p_tax numeric, p_note text, p_items json) TO service_role;


--
-- TOC entry 4474 (class 0 OID 0)
-- Dependencies: 523
-- Name: FUNCTION create_invoice_with_items(p_customer_name text, p_customer_phone text, p_customer_notes text, p_payment_method text, p_discount numeric, p_tax numeric, p_note text, p_items jsonb); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.create_invoice_with_items(p_customer_name text, p_customer_phone text, p_customer_notes text, p_payment_method text, p_discount numeric, p_tax numeric, p_note text, p_items jsonb) TO anon;
GRANT ALL ON FUNCTION public.create_invoice_with_items(p_customer_name text, p_customer_phone text, p_customer_notes text, p_payment_method text, p_discount numeric, p_tax numeric, p_note text, p_items jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.create_invoice_with_items(p_customer_name text, p_customer_phone text, p_customer_notes text, p_payment_method text, p_discount numeric, p_tax numeric, p_note text, p_items jsonb) TO service_role;


--
-- TOC entry 4475 (class 0 OID 0)
-- Dependencies: 524
-- Name: FUNCTION create_invoice_with_items_safe(p_customer_name text, p_customer_phone text, p_customer_notes text, p_payment_method text, p_discount numeric, p_tax numeric, p_note text, p_items jsonb, p_client_idempotency_key text, p_created_by_employee_id uuid, p_tenant_id uuid, p_branch_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.create_invoice_with_items_safe(p_customer_name text, p_customer_phone text, p_customer_notes text, p_payment_method text, p_discount numeric, p_tax numeric, p_note text, p_items jsonb, p_client_idempotency_key text, p_created_by_employee_id uuid, p_tenant_id uuid, p_branch_id uuid) TO anon;
GRANT ALL ON FUNCTION public.create_invoice_with_items_safe(p_customer_name text, p_customer_phone text, p_customer_notes text, p_payment_method text, p_discount numeric, p_tax numeric, p_note text, p_items jsonb, p_client_idempotency_key text, p_created_by_employee_id uuid, p_tenant_id uuid, p_branch_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.create_invoice_with_items_safe(p_customer_name text, p_customer_phone text, p_customer_notes text, p_payment_method text, p_discount numeric, p_tax numeric, p_note text, p_items jsonb, p_client_idempotency_key text, p_created_by_employee_id uuid, p_tenant_id uuid, p_branch_id uuid) TO service_role;


--
-- TOC entry 4476 (class 0 OID 0)
-- Dependencies: 557
-- Name: FUNCTION create_support_ticket_atomic(p_tenant_id uuid, p_branch_id uuid, p_created_by uuid, p_category text, p_priority text, p_title text, p_description text, p_source text, p_page_path text, p_error_reference text, p_error_code text, p_safe_error_message text, p_diagnostic_context jsonb); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.create_support_ticket_atomic(p_tenant_id uuid, p_branch_id uuid, p_created_by uuid, p_category text, p_priority text, p_title text, p_description text, p_source text, p_page_path text, p_error_reference text, p_error_code text, p_safe_error_message text, p_diagnostic_context jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_support_ticket_atomic(p_tenant_id uuid, p_branch_id uuid, p_created_by uuid, p_category text, p_priority text, p_title text, p_description text, p_source text, p_page_path text, p_error_reference text, p_error_code text, p_safe_error_message text, p_diagnostic_context jsonb) TO service_role;


--
-- TOC entry 4477 (class 0 OID 0)
-- Dependencies: 525
-- Name: FUNCTION create_tenant_with_owner(p_tenant_name text, p_owner_user_id uuid, p_owner_username text, p_owner_full_name text, p_owner_contact_email text, p_owner_phone text, p_default_branch_name text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.create_tenant_with_owner(p_tenant_name text, p_owner_user_id uuid, p_owner_username text, p_owner_full_name text, p_owner_contact_email text, p_owner_phone text, p_default_branch_name text) TO anon;
GRANT ALL ON FUNCTION public.create_tenant_with_owner(p_tenant_name text, p_owner_user_id uuid, p_owner_username text, p_owner_full_name text, p_owner_contact_email text, p_owner_phone text, p_default_branch_name text) TO authenticated;
GRANT ALL ON FUNCTION public.create_tenant_with_owner(p_tenant_name text, p_owner_user_id uuid, p_owner_username text, p_owner_full_name text, p_owner_contact_email text, p_owner_phone text, p_default_branch_name text) TO service_role;


--
-- TOC entry 4478 (class 0 OID 0)
-- Dependencies: 526
-- Name: FUNCTION create_tenant_with_owner(p_tenant_name text, p_owner_user_id uuid, p_owner_username text, p_owner_full_name text, p_owner_contact_email text, p_owner_phone text, p_default_branch_code text, p_default_branch_name text, p_vat_rate numeric, p_vat_active boolean); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.create_tenant_with_owner(p_tenant_name text, p_owner_user_id uuid, p_owner_username text, p_owner_full_name text, p_owner_contact_email text, p_owner_phone text, p_default_branch_code text, p_default_branch_name text, p_vat_rate numeric, p_vat_active boolean) TO anon;
GRANT ALL ON FUNCTION public.create_tenant_with_owner(p_tenant_name text, p_owner_user_id uuid, p_owner_username text, p_owner_full_name text, p_owner_contact_email text, p_owner_phone text, p_default_branch_code text, p_default_branch_name text, p_vat_rate numeric, p_vat_active boolean) TO authenticated;
GRANT ALL ON FUNCTION public.create_tenant_with_owner(p_tenant_name text, p_owner_user_id uuid, p_owner_username text, p_owner_full_name text, p_owner_contact_email text, p_owner_phone text, p_default_branch_code text, p_default_branch_name text, p_vat_rate numeric, p_vat_active boolean) TO service_role;


--
-- TOC entry 4479 (class 0 OID 0)
-- Dependencies: 527
-- Name: FUNCTION current_profile_role(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.current_profile_role() TO anon;
GRANT ALL ON FUNCTION public.current_profile_role() TO authenticated;
GRANT ALL ON FUNCTION public.current_profile_role() TO service_role;


--
-- TOC entry 4480 (class 0 OID 0)
-- Dependencies: 528
-- Name: FUNCTION current_profile_tenant_id(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.current_profile_tenant_id() FROM PUBLIC;
GRANT ALL ON FUNCTION public.current_profile_tenant_id() TO authenticated;
GRANT ALL ON FUNCTION public.current_profile_tenant_id() TO service_role;


--
-- TOC entry 4481 (class 0 OID 0)
-- Dependencies: 529
-- Name: FUNCTION current_user_role(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.current_user_role() TO anon;
GRANT ALL ON FUNCTION public.current_user_role() TO authenticated;
GRANT ALL ON FUNCTION public.current_user_role() TO service_role;


--
-- TOC entry 4482 (class 0 OID 0)
-- Dependencies: 530
-- Name: FUNCTION deduct_inventory_on_invoice_item_insert(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.deduct_inventory_on_invoice_item_insert() TO anon;
GRANT ALL ON FUNCTION public.deduct_inventory_on_invoice_item_insert() TO authenticated;
GRANT ALL ON FUNCTION public.deduct_inventory_on_invoice_item_insert() TO service_role;


--
-- TOC entry 4483 (class 0 OID 0)
-- Dependencies: 531
-- Name: FUNCTION ensure_branch_order_number_prefix(p_branch_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.ensure_branch_order_number_prefix(p_branch_id uuid) TO anon;
GRANT ALL ON FUNCTION public.ensure_branch_order_number_prefix(p_branch_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.ensure_branch_order_number_prefix(p_branch_id uuid) TO service_role;


--
-- TOC entry 4484 (class 0 OID 0)
-- Dependencies: 532
-- Name: FUNCTION ensure_inventory_stock_for_catalog_item(p_catalog_item_id uuid, p_tenant_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.ensure_inventory_stock_for_catalog_item(p_catalog_item_id uuid, p_tenant_id uuid) TO anon;
GRANT ALL ON FUNCTION public.ensure_inventory_stock_for_catalog_item(p_catalog_item_id uuid, p_tenant_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.ensure_inventory_stock_for_catalog_item(p_catalog_item_id uuid, p_tenant_id uuid) TO service_role;


--
-- TOC entry 4485 (class 0 OID 0)
-- Dependencies: 533
-- Name: FUNCTION generate_invoice_number(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.generate_invoice_number() TO anon;
GRANT ALL ON FUNCTION public.generate_invoice_number() TO authenticated;
GRANT ALL ON FUNCTION public.generate_invoice_number() TO service_role;


--
-- TOC entry 4486 (class 0 OID 0)
-- Dependencies: 534
-- Name: FUNCTION generate_order_number(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.generate_order_number() TO anon;
GRANT ALL ON FUNCTION public.generate_order_number() TO authenticated;
GRANT ALL ON FUNCTION public.generate_order_number() TO service_role;


--
-- TOC entry 4487 (class 0 OID 0)
-- Dependencies: 535
-- Name: FUNCTION get_branch_inventory(p_branch_id uuid, p_tenant_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.get_branch_inventory(p_branch_id uuid, p_tenant_id uuid) TO anon;
GRANT ALL ON FUNCTION public.get_branch_inventory(p_branch_id uuid, p_tenant_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.get_branch_inventory(p_branch_id uuid, p_tenant_id uuid) TO service_role;


--
-- TOC entry 4489 (class 0 OID 0)
-- Dependencies: 560
-- Name: FUNCTION get_developer_support_notifications(p_provider_user_id uuid, p_limit integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.get_developer_support_notifications(p_provider_user_id uuid, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_developer_support_notifications(p_provider_user_id uuid, p_limit integer) TO service_role;


--
-- TOC entry 4491 (class 0 OID 0)
-- Dependencies: 559
-- Name: FUNCTION get_eligible_developer_support_notification_events(p_provider_user_id uuid, p_through timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.get_eligible_developer_support_notification_events(p_provider_user_id uuid, p_through timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_eligible_developer_support_notification_events(p_provider_user_id uuid, p_through timestamp with time zone) TO service_role;


--
-- TOC entry 4493 (class 0 OID 0)
-- Dependencies: 558
-- Name: FUNCTION get_provider_support_operational_dashboard(p_provider_user_id uuid, p_page integer, p_page_size integer, p_search text, p_status text, p_priority text, p_category text, p_organization text, p_assignment text, p_operational_filter text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.get_provider_support_operational_dashboard(p_provider_user_id uuid, p_page integer, p_page_size integer, p_search text, p_status text, p_priority text, p_category text, p_organization text, p_assignment text, p_operational_filter text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.get_provider_support_operational_dashboard(p_provider_user_id uuid, p_page integer, p_page_size integer, p_search text, p_status text, p_priority text, p_category text, p_organization text, p_assignment text, p_operational_filter text) TO service_role;


--
-- TOC entry 4494 (class 0 OID 0)
-- Dependencies: 536
-- Name: FUNCTION hash_pos_pin(raw_pin text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.hash_pos_pin(raw_pin text) TO anon;
GRANT ALL ON FUNCTION public.hash_pos_pin(raw_pin text) TO authenticated;
GRANT ALL ON FUNCTION public.hash_pos_pin(raw_pin text) TO service_role;


--
-- TOC entry 4495 (class 0 OID 0)
-- Dependencies: 555
-- Name: FUNCTION is_active_platform_admin(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.is_active_platform_admin() FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_active_platform_admin() TO authenticated;
GRANT ALL ON FUNCTION public.is_active_platform_admin() TO service_role;


--
-- TOC entry 4496 (class 0 OID 0)
-- Dependencies: 537
-- Name: FUNCTION is_admin(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.is_admin() TO anon;
GRANT ALL ON FUNCTION public.is_admin() TO authenticated;
GRANT ALL ON FUNCTION public.is_admin() TO service_role;


--
-- TOC entry 4498 (class 0 OID 0)
-- Dependencies: 562
-- Name: FUNCTION mark_all_developer_support_notifications_read(p_provider_user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.mark_all_developer_support_notifications_read(p_provider_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mark_all_developer_support_notifications_read(p_provider_user_id uuid) TO service_role;


--
-- TOC entry 4500 (class 0 OID 0)
-- Dependencies: 561
-- Name: FUNCTION mark_developer_support_notification_read(p_provider_user_id uuid, p_event_type text, p_event_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.mark_developer_support_notification_read(p_provider_user_id uuid, p_event_type text, p_event_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mark_developer_support_notification_read(p_provider_user_id uuid, p_event_type text, p_event_id uuid) TO service_role;


--
-- TOC entry 4501 (class 0 OID 0)
-- Dependencies: 538
-- Name: FUNCTION next_branch_monthly_order_number(p_tenant_id uuid, p_branch_id uuid, p_created_at timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.next_branch_monthly_order_number(p_tenant_id uuid, p_branch_id uuid, p_created_at timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.next_branch_monthly_order_number(p_tenant_id uuid, p_branch_id uuid, p_created_at timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.next_branch_monthly_order_number(p_tenant_id uuid, p_branch_id uuid, p_created_at timestamp with time zone) TO service_role;


--
-- TOC entry 4502 (class 0 OID 0)
-- Dependencies: 539
-- Name: FUNCTION purge_expired_deleted_branches(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.purge_expired_deleted_branches() TO anon;
GRANT ALL ON FUNCTION public.purge_expired_deleted_branches() TO authenticated;
GRANT ALL ON FUNCTION public.purge_expired_deleted_branches() TO service_role;


--
-- TOC entry 4503 (class 0 OID 0)
-- Dependencies: 540
-- Name: FUNCTION resolve_insert_branch_id(requested_branch_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.resolve_insert_branch_id(requested_branch_id uuid) TO anon;
GRANT ALL ON FUNCTION public.resolve_insert_branch_id(requested_branch_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.resolve_insert_branch_id(requested_branch_id uuid) TO service_role;


--
-- TOC entry 4504 (class 0 OID 0)
-- Dependencies: 541
-- Name: FUNCTION restore_inventory_for_cancelled_invoice(p_invoice_id uuid, p_tenant_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.restore_inventory_for_cancelled_invoice(p_invoice_id uuid, p_tenant_id uuid) TO anon;
GRANT ALL ON FUNCTION public.restore_inventory_for_cancelled_invoice(p_invoice_id uuid, p_tenant_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.restore_inventory_for_cancelled_invoice(p_invoice_id uuid, p_tenant_id uuid) TO service_role;


--
-- TOC entry 4505 (class 0 OID 0)
-- Dependencies: 542
-- Name: FUNCTION rls_auto_enable(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.rls_auto_enable() TO anon;
GRANT ALL ON FUNCTION public.rls_auto_enable() TO authenticated;
GRANT ALL ON FUNCTION public.rls_auto_enable() TO service_role;


--
-- TOC entry 4506 (class 0 OID 0)
-- Dependencies: 543
-- Name: FUNCTION set_customers_branch_id(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.set_customers_branch_id() TO anon;
GRANT ALL ON FUNCTION public.set_customers_branch_id() TO authenticated;
GRANT ALL ON FUNCTION public.set_customers_branch_id() TO service_role;


--
-- TOC entry 4507 (class 0 OID 0)
-- Dependencies: 544
-- Name: FUNCTION set_invoice_number_from_order(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.set_invoice_number_from_order() TO anon;
GRANT ALL ON FUNCTION public.set_invoice_number_from_order() TO authenticated;
GRANT ALL ON FUNCTION public.set_invoice_number_from_order() TO service_role;


--
-- TOC entry 4508 (class 0 OID 0)
-- Dependencies: 545
-- Name: FUNCTION set_invoices_branch_id(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.set_invoices_branch_id() TO anon;
GRANT ALL ON FUNCTION public.set_invoices_branch_id() TO authenticated;
GRANT ALL ON FUNCTION public.set_invoices_branch_id() TO service_role;


--
-- TOC entry 4509 (class 0 OID 0)
-- Dependencies: 546
-- Name: FUNCTION set_order_number_branch_monthly(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.set_order_number_branch_monthly() TO anon;
GRANT ALL ON FUNCTION public.set_order_number_branch_monthly() TO authenticated;
GRANT ALL ON FUNCTION public.set_order_number_branch_monthly() TO service_role;


--
-- TOC entry 4510 (class 0 OID 0)
-- Dependencies: 547
-- Name: FUNCTION set_orders_branch_id(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.set_orders_branch_id() TO anon;
GRANT ALL ON FUNCTION public.set_orders_branch_id() TO authenticated;
GRANT ALL ON FUNCTION public.set_orders_branch_id() TO service_role;


--
-- TOC entry 4511 (class 0 OID 0)
-- Dependencies: 548
-- Name: FUNCTION set_pos_pin(raw_pin text, user_id uuid); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.set_pos_pin(raw_pin text, user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.set_pos_pin(raw_pin text, user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.set_pos_pin(raw_pin text, user_id uuid) TO service_role;


--
-- TOC entry 4512 (class 0 OID 0)
-- Dependencies: 549
-- Name: FUNCTION set_updated_at(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_updated_at() TO service_role;


--
-- TOC entry 4513 (class 0 OID 0)
-- Dependencies: 550
-- Name: FUNCTION set_updated_at_system_settings(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.set_updated_at_system_settings() TO anon;
GRANT ALL ON FUNCTION public.set_updated_at_system_settings() TO authenticated;
GRANT ALL ON FUNCTION public.set_updated_at_system_settings() TO service_role;


--
-- TOC entry 4514 (class 0 OID 0)
-- Dependencies: 551
-- Name: FUNCTION set_vat_updated_at(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.set_vat_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_vat_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_vat_updated_at() TO service_role;


--
-- TOC entry 4515 (class 0 OID 0)
-- Dependencies: 556
-- Name: FUNCTION touch_support_updated_at(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.touch_support_updated_at() FROM PUBLIC;
GRANT ALL ON FUNCTION public.touch_support_updated_at() TO service_role;


--
-- TOC entry 4516 (class 0 OID 0)
-- Dependencies: 552
-- Name: FUNCTION update_inventory_low_stock_threshold(p_tenant_id uuid, p_branch_id uuid, p_catalog_item_id uuid, p_low_stock_threshold numeric); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.update_inventory_low_stock_threshold(p_tenant_id uuid, p_branch_id uuid, p_catalog_item_id uuid, p_low_stock_threshold numeric) TO anon;
GRANT ALL ON FUNCTION public.update_inventory_low_stock_threshold(p_tenant_id uuid, p_branch_id uuid, p_catalog_item_id uuid, p_low_stock_threshold numeric) TO authenticated;
GRANT ALL ON FUNCTION public.update_inventory_low_stock_threshold(p_tenant_id uuid, p_branch_id uuid, p_catalog_item_id uuid, p_low_stock_threshold numeric) TO service_role;


--
-- TOC entry 4517 (class 0 OID 0)
-- Dependencies: 553
-- Name: FUNCTION validate_password_policy(p_password text); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.validate_password_policy(p_password text) TO anon;
GRANT ALL ON FUNCTION public.validate_password_policy(p_password text) TO authenticated;
GRANT ALL ON FUNCTION public.validate_password_policy(p_password text) TO service_role;


--
-- TOC entry 4518 (class 0 OID 0)
-- Dependencies: 554
-- Name: FUNCTION verify_pos_pin_for_actor(p_raw_pin text, p_actor_user_id uuid, p_requested_branch_id uuid); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.verify_pos_pin_for_actor(p_raw_pin text, p_actor_user_id uuid, p_requested_branch_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.verify_pos_pin_for_actor(p_raw_pin text, p_actor_user_id uuid, p_requested_branch_id uuid) TO anon;
GRANT ALL ON FUNCTION public.verify_pos_pin_for_actor(p_raw_pin text, p_actor_user_id uuid, p_requested_branch_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.verify_pos_pin_for_actor(p_raw_pin text, p_actor_user_id uuid, p_requested_branch_id uuid) TO service_role;


--
-- TOC entry 4519 (class 0 OID 0)
-- Dependencies: 372
-- Name: TABLE announcement_manual_customers; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.announcement_manual_customers TO anon;
GRANT ALL ON TABLE public.announcement_manual_customers TO authenticated;
GRANT ALL ON TABLE public.announcement_manual_customers TO service_role;


--
-- TOC entry 4520 (class 0 OID 0)
-- Dependencies: 373
-- Name: TABLE announcement_recipients; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.announcement_recipients TO anon;
GRANT ALL ON TABLE public.announcement_recipients TO authenticated;
GRANT ALL ON TABLE public.announcement_recipients TO service_role;


--
-- TOC entry 4521 (class 0 OID 0)
-- Dependencies: 374
-- Name: TABLE announcements; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.announcements TO anon;
GRANT ALL ON TABLE public.announcements TO authenticated;
GRANT ALL ON TABLE public.announcements TO service_role;


--
-- TOC entry 4522 (class 0 OID 0)
-- Dependencies: 375
-- Name: TABLE audit_logs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.audit_logs TO anon;
GRANT ALL ON TABLE public.audit_logs TO authenticated;
GRANT ALL ON TABLE public.audit_logs TO service_role;


--
-- TOC entry 4523 (class 0 OID 0)
-- Dependencies: 376
-- Name: TABLE branch_catalog_items; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.branch_catalog_items TO anon;
GRANT ALL ON TABLE public.branch_catalog_items TO authenticated;
GRANT ALL ON TABLE public.branch_catalog_items TO service_role;


--
-- TOC entry 4524 (class 0 OID 0)
-- Dependencies: 377
-- Name: TABLE branch_whatsapp_configs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.branch_whatsapp_configs TO anon;
GRANT ALL ON TABLE public.branch_whatsapp_configs TO authenticated;
GRANT ALL ON TABLE public.branch_whatsapp_configs TO service_role;


--
-- TOC entry 4525 (class 0 OID 0)
-- Dependencies: 378
-- Name: TABLE branches; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.branches TO anon;
GRANT ALL ON TABLE public.branches TO authenticated;
GRANT ALL ON TABLE public.branches TO service_role;


--
-- TOC entry 4526 (class 0 OID 0)
-- Dependencies: 379
-- Name: TABLE catalog_categories; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.catalog_categories TO anon;
GRANT ALL ON TABLE public.catalog_categories TO authenticated;
GRANT ALL ON TABLE public.catalog_categories TO service_role;


--
-- TOC entry 4527 (class 0 OID 0)
-- Dependencies: 380
-- Name: TABLE catalog_items; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.catalog_items TO anon;
GRANT ALL ON TABLE public.catalog_items TO authenticated;
GRANT ALL ON TABLE public.catalog_items TO service_role;


--
-- TOC entry 4528 (class 0 OID 0)
-- Dependencies: 381
-- Name: TABLE categories; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.categories TO anon;
GRANT ALL ON TABLE public.categories TO authenticated;
GRANT ALL ON TABLE public.categories TO service_role;


--
-- TOC entry 4529 (class 0 OID 0)
-- Dependencies: 382
-- Name: TABLE customers; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.customers TO anon;
GRANT ALL ON TABLE public.customers TO authenticated;
GRANT ALL ON TABLE public.customers TO service_role;


--
-- TOC entry 4530 (class 0 OID 0)
-- Dependencies: 383
-- Name: TABLE discounts; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.discounts TO anon;
GRANT ALL ON TABLE public.discounts TO authenticated;
GRANT ALL ON TABLE public.discounts TO service_role;


--
-- TOC entry 4531 (class 0 OID 0)
-- Dependencies: 384
-- Name: TABLE inventory_movements; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.inventory_movements TO anon;
GRANT ALL ON TABLE public.inventory_movements TO authenticated;
GRANT ALL ON TABLE public.inventory_movements TO service_role;


--
-- TOC entry 4532 (class 0 OID 0)
-- Dependencies: 385
-- Name: TABLE invoice_items; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.invoice_items TO anon;
GRANT ALL ON TABLE public.invoice_items TO authenticated;
GRANT ALL ON TABLE public.invoice_items TO service_role;


--
-- TOC entry 4533 (class 0 OID 0)
-- Dependencies: 386
-- Name: TABLE invoices; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.invoices TO anon;
GRANT ALL ON TABLE public.invoices TO authenticated;
GRANT ALL ON TABLE public.invoices TO service_role;


--
-- TOC entry 4534 (class 0 OID 0)
-- Dependencies: 387
-- Name: TABLE orders; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.orders TO anon;
GRANT ALL ON TABLE public.orders TO authenticated;
GRANT ALL ON TABLE public.orders TO service_role;


--
-- TOC entry 4535 (class 0 OID 0)
-- Dependencies: 388
-- Name: TABLE pos_profiles; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.pos_profiles TO anon;
GRANT ALL ON TABLE public.pos_profiles TO authenticated;
GRANT ALL ON TABLE public.pos_profiles TO service_role;


--
-- TOC entry 4536 (class 0 OID 0)
-- Dependencies: 388 4535
-- Name: COLUMN pos_profiles.id; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(id) ON TABLE public.pos_profiles TO authenticated;


--
-- TOC entry 4537 (class 0 OID 0)
-- Dependencies: 388 4535
-- Name: COLUMN pos_profiles.tenant_id; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(tenant_id) ON TABLE public.pos_profiles TO authenticated;


--
-- TOC entry 4538 (class 0 OID 0)
-- Dependencies: 388 4535
-- Name: COLUMN pos_profiles.username; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(username) ON TABLE public.pos_profiles TO authenticated;


--
-- TOC entry 4539 (class 0 OID 0)
-- Dependencies: 388 4535
-- Name: COLUMN pos_profiles.full_name; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(full_name) ON TABLE public.pos_profiles TO authenticated;


--
-- TOC entry 4540 (class 0 OID 0)
-- Dependencies: 388 4535
-- Name: COLUMN pos_profiles.role; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(role) ON TABLE public.pos_profiles TO authenticated;


--
-- TOC entry 4541 (class 0 OID 0)
-- Dependencies: 389
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- TOC entry 4542 (class 0 OID 0)
-- Dependencies: 389 4541
-- Name: COLUMN profiles.id; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(id) ON TABLE public.profiles TO authenticated;


--
-- TOC entry 4543 (class 0 OID 0)
-- Dependencies: 389 4541
-- Name: COLUMN profiles.full_name; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(full_name),UPDATE(full_name) ON TABLE public.profiles TO authenticated;


--
-- TOC entry 4544 (class 0 OID 0)
-- Dependencies: 389 4541
-- Name: COLUMN profiles.role; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(role) ON TABLE public.profiles TO authenticated;


--
-- TOC entry 4545 (class 0 OID 0)
-- Dependencies: 389 4541
-- Name: COLUMN profiles.is_active; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(is_active) ON TABLE public.profiles TO authenticated;


--
-- TOC entry 4546 (class 0 OID 0)
-- Dependencies: 389 4541
-- Name: COLUMN profiles.updated_at; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE(updated_at) ON TABLE public.profiles TO authenticated;


--
-- TOC entry 4547 (class 0 OID 0)
-- Dependencies: 389 4541
-- Name: COLUMN profiles.username; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(username) ON TABLE public.profiles TO authenticated;


--
-- TOC entry 4548 (class 0 OID 0)
-- Dependencies: 389 4541
-- Name: COLUMN profiles.branch_id; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(branch_id) ON TABLE public.profiles TO authenticated;


--
-- TOC entry 4549 (class 0 OID 0)
-- Dependencies: 389 4541
-- Name: COLUMN profiles.contact_email; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(contact_email),UPDATE(contact_email) ON TABLE public.profiles TO authenticated;


--
-- TOC entry 4550 (class 0 OID 0)
-- Dependencies: 389 4541
-- Name: COLUMN profiles.phone; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(phone),UPDATE(phone) ON TABLE public.profiles TO authenticated;


--
-- TOC entry 4551 (class 0 OID 0)
-- Dependencies: 389 4541
-- Name: COLUMN profiles.tenant_id; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(tenant_id) ON TABLE public.profiles TO authenticated;


--
-- TOC entry 4552 (class 0 OID 0)
-- Dependencies: 389 4541
-- Name: COLUMN profiles.tenant_name; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT(tenant_name) ON TABLE public.profiles TO authenticated;


--
-- TOC entry 4553 (class 0 OID 0)
-- Dependencies: 390
-- Name: TABLE inventory_movements_view; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.inventory_movements_view TO anon;
GRANT ALL ON TABLE public.inventory_movements_view TO authenticated;
GRANT ALL ON TABLE public.inventory_movements_view TO service_role;


--
-- TOC entry 4554 (class 0 OID 0)
-- Dependencies: 391
-- Name: TABLE inventory_stock; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.inventory_stock TO anon;
GRANT ALL ON TABLE public.inventory_stock TO authenticated;
GRANT ALL ON TABLE public.inventory_stock TO service_role;


--
-- TOC entry 4555 (class 0 OID 0)
-- Dependencies: 392
-- Name: SEQUENCE invoice_number_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.invoice_number_seq TO anon;
GRANT ALL ON SEQUENCE public.invoice_number_seq TO authenticated;
GRANT ALL ON SEQUENCE public.invoice_number_seq TO service_role;


--
-- TOC entry 4556 (class 0 OID 0)
-- Dependencies: 393
-- Name: SEQUENCE order_number_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.order_number_seq TO anon;
GRANT ALL ON SEQUENCE public.order_number_seq TO authenticated;
GRANT ALL ON SEQUENCE public.order_number_seq TO service_role;


--
-- TOC entry 4557 (class 0 OID 0)
-- Dependencies: 394
-- Name: TABLE order_number_sequences; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.order_number_sequences TO anon;
GRANT ALL ON TABLE public.order_number_sequences TO authenticated;
GRANT ALL ON TABLE public.order_number_sequences TO service_role;


--
-- TOC entry 4558 (class 0 OID 0)
-- Dependencies: 395
-- Name: TABLE order_status_logs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.order_status_logs TO anon;
GRANT ALL ON TABLE public.order_status_logs TO authenticated;
GRANT ALL ON TABLE public.order_status_logs TO service_role;


--
-- TOC entry 4559 (class 0 OID 0)
-- Dependencies: 400
-- Name: TABLE platform_admins; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE public.platform_admins TO authenticated;
GRANT ALL ON TABLE public.platform_admins TO service_role;


--
-- TOC entry 4560 (class 0 OID 0)
-- Dependencies: 396
-- Name: TABLE settings; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.settings TO anon;
GRANT ALL ON TABLE public.settings TO authenticated;
GRANT ALL ON TABLE public.settings TO service_role;


--
-- TOC entry 4561 (class 0 OID 0)
-- Dependencies: 405
-- Name: TABLE support_attachments; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.support_attachments TO service_role;


--
-- TOC entry 4565 (class 0 OID 0)
-- Dependencies: 406
-- Name: TABLE support_developer_notification_reads; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,MAINTAIN ON TABLE public.support_developer_notification_reads TO service_role;


--
-- TOC entry 4566 (class 0 OID 0)
-- Dependencies: 403
-- Name: TABLE support_messages; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE public.support_messages TO authenticated;
GRANT ALL ON TABLE public.support_messages TO service_role;


--
-- TOC entry 4567 (class 0 OID 0)
-- Dependencies: 404
-- Name: TABLE support_ticket_events; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE public.support_ticket_events TO authenticated;
GRANT ALL ON TABLE public.support_ticket_events TO service_role;


--
-- TOC entry 4568 (class 0 OID 0)
-- Dependencies: 401
-- Name: SEQUENCE support_ticket_number_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.support_ticket_number_seq TO service_role;


--
-- TOC entry 4569 (class 0 OID 0)
-- Dependencies: 402
-- Name: TABLE support_tickets; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,MAINTAIN ON TABLE public.support_tickets TO authenticated;
GRANT ALL ON TABLE public.support_tickets TO service_role;


--
-- TOC entry 4570 (class 0 OID 0)
-- Dependencies: 397
-- Name: TABLE system_settings; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.system_settings TO anon;
GRANT ALL ON TABLE public.system_settings TO authenticated;
GRANT ALL ON TABLE public.system_settings TO service_role;


--
-- TOC entry 4571 (class 0 OID 0)
-- Dependencies: 398
-- Name: TABLE tenants; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.tenants TO anon;
GRANT ALL ON TABLE public.tenants TO authenticated;
GRANT ALL ON TABLE public.tenants TO service_role;


--
-- TOC entry 4572 (class 0 OID 0)
-- Dependencies: 399
-- Name: TABLE vat_settings; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.vat_settings TO anon;
GRANT ALL ON TABLE public.vat_settings TO authenticated;
GRANT ALL ON TABLE public.vat_settings TO service_role;


--
-- TOC entry 2597 (class 826 OID 16494)
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- TOC entry 2576 (class 826 OID 16495)
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- TOC entry 2598 (class 826 OID 16493)
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- TOC entry 2578 (class 826 OID 16497)
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- TOC entry 2599 (class 826 OID 16492)
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- TOC entry 2577 (class 826 OID 16496)
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


-- Completed on 2026-07-22 00:52:08

--
-- PostgreSQL database dump complete
--

\unrestrict AUx91LP4esqDw4R3OZJiJaEqysBwIKkhlv9Le8b6fBiigbdRzjlzNMsE1Po9EWo

