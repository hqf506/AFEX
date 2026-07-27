/*
AFEX Core V2 I5.9 - Package 6B
Authoritative Financial Quote Contract, Shared Authorization Validation and
Financial Parity Foundation

STATIC SQL ONLY. DO NOT EXECUTE FROM THIS REVIEW WORKSPACE.

This additive package creates an authoritative advisory-quote issuer by
reusing Package 4S financial derivation and fingerprint functions. It does not
activate Core V2, grant any runtime/browser function, revoke any legacy path,
disable any trigger, change a financial rule or backfill historical rows.

Approved external hashes:
  Package 2B-S
    009395af590b53c39a33004c3ad63d1e28a176291d5cfbaa6feb9b71329e591d
  Package 4T
    40900e9e2bed32ef1f3064881081892719037924d19dfb9a6ff37f5d2feecfe7
  Package 5R-B
    df141eb3ad7c1ff9b9a2ca700a06b4493c524d671b384cf2c4d6a61b0fb569a3
  Package 6A repaired foundation
    01466f6d61a90bfd56b2c4a40c776c8ce36cd850f9a24f47e89fd6d21e557351

Frozen authoritative rules inherited without alteration from Package 4S:
  - maximum 100 distinct request lines and aggregate quantity <= 10000/item;
  - duplicate catalog IDs aggregate before calculation and UUID ordering wins;
  - active branch override price wins, otherwise catalog default price;
  - catalog item must be same tenant, active, not deleted, product/service;
  - one optional discount by ID, same tenant, global or matching branch;
  - one discount only; percentage 0..100 or fixed 0..subtotal; no stacking;
  - branch active VAT wins, otherwise exactly one active tenant-global VAT;
  - VAT range 0..100 and tax-exclusive calculation;
  - PostgreSQL numeric round(...,2), half away from zero;
  - line discount is proportional; final line receives exact residual;
  - payment methods: cash/card/mada/visa/transfer/on_delivery (cod normalized);
  - no manual price, manual discount amount, manual VAT rate or caller total.
*/

-- ===========================================================================
-- A. EXACT DEPENDENCY PREFLIGHT
-- ===========================================================================

do $package6b_preflight$
declare
  v_missing text;
  v_unexpected text;
  v_table text;
  v_role pg_roles%rowtype;
begin
  with expected(signature) as (values
    ('create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)'),
    ('derive_atomic_financial_snapshot_v2(uuid,uuid,jsonb)'),
    ('build_atomic_request_fingerprint_v2(jsonb,jsonb)'),
    ('consume_atomic_authorization_context_v1(text,text,uuid)'),
    ('issue_atomic_authorization_context_v1(uuid,text,text)'),
    ('issue_pos_atomic_authorization_context_v1(text,uuid,text,text)'),
    ('is_core_v2_request_enabled_v1(uuid,uuid,text,text)'),
    ('check_and_record_core_v2_issuer_rate_limit_v1(text,uuid,uuid,uuid,text,boolean)'),
    ('record_core_v2_verification_evidence_v1(text,text,uuid,uuid,text,text,text,text,timestamptz,timestamptz,uuid,text,text,uuid)'),
    ('register_core_v2_managed_identity_v1(name,text,text,text,text,name,text,uuid,text)'),
    ('deactivate_core_v2_v1(uuid,text,text,bigint)')
  )
  select string_agg(signature, ', ' order by signature)
  into v_missing
  from expected
  where to_regprocedure('public.' || signature) is null;

  if v_missing is not null then
    raise exception using
      errcode = '55000',
      message = 'PACKAGE6B_REQUIRED_SIGNATURE_MISSING',
      detail = v_missing;
  end if;

  with expected(proname, identity_args) as (values
    ('create_order_atomic_v2','jsonb, jsonb, jsonb, jsonb'),
    ('derive_atomic_financial_snapshot_v2','uuid, uuid, jsonb'),
    ('build_atomic_request_fingerprint_v2','jsonb, jsonb'),
    ('consume_atomic_authorization_context_v1','text, text, uuid'),
    ('issue_atomic_authorization_context_v1','uuid, text, text'),
    ('issue_pos_atomic_authorization_context_v1','text, uuid, text, text'),
    ('is_core_v2_request_enabled_v1','uuid, uuid, text, text'),
    ('check_and_record_core_v2_issuer_rate_limit_v1','text, uuid, uuid, uuid, text, boolean'),
    ('record_core_v2_verification_evidence_v1','text, text, uuid, uuid, text, text, text, text, timestamp with time zone, timestamp with time zone, uuid, text, text, uuid'),
    ('register_core_v2_managed_identity_v1','name, text, text, text, text, name, text, uuid, text'),
    ('deactivate_core_v2_v1','uuid, text, text, bigint')
  ),
  actual as (
    select p.proname, pg_get_function_identity_arguments(p.oid) identity_args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (select proname from expected)
  )
  select string_agg(
    format('%I(%s)', a.proname, a.identity_args),
    ', ' order by a.proname, a.identity_args
  )
  into v_unexpected
  from actual a
  left join expected e
    on e.proname = a.proname
   and e.identity_args = a.identity_args
  where e.proname is null;

  if v_unexpected is not null then
    raise exception using
      errcode = '55000',
      message = 'PACKAGE6B_UNEXPECTED_OVERLOAD',
      detail = v_unexpected;
  end if;

  foreach v_table in array array[
    'financial_quotes',
    'atomic_authorization_contexts',
    'profiles',
    'pos_profiles',
    'tenants',
    'branches',
    'catalog_items',
    'branch_catalog_items',
    'discounts',
    'vat_settings',
    'core_v2_activation_control',
    'core_v2_tenant_activation',
    'core_v2_branch_activation',
    'core_v2_verification_evidence',
    'core_v2_issuer_rate_limit_config',
    'core_v2_issuer_rate_limit_windows'
  ]
  loop
    if to_regclass('public.' || v_table) is null then
      raise exception using
        errcode = '55000',
        message = 'PACKAGE6B_REQUIRED_TABLE_MISSING',
        detail = v_table;
    end if;
  end loop;

  select * into strict v_role
  from pg_roles where rolname = 'afex_core_owner';
  if v_role.rolcanlogin
     or v_role.rolsuper
     or v_role.rolcreatedb
     or v_role.rolcreaterole
     or v_role.rolinherit
     or v_role.rolreplication
     or v_role.rolbypassrls then
    raise exception using
      errcode = '55000',
      message = 'PACKAGE6B_CORE_OWNER_UNSAFE';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.financial_quotes'::regclass
      and conname = 'fk_financial_quotes_authorization_context'
      and contype = 'f'
  )
  or to_regclass('public.uq_financial_quotes_authorization_context') is null
  then
    raise exception using
      errcode = '55000',
      message = 'PACKAGE6B_QUOTE_CONTEXT_CONTRACT_MISSING';
  end if;
end;
$package6b_preflight$;

begin;

-- ===========================================================================
-- B. SHARED AUTHORIZATION-CONTEXT VALIDATION
-- Package 5R-B and 6A-A must delegate to this helper in follow-up packages.
-- ===========================================================================

create function public.validate_atomic_authorization_context_internal_v1(
  p_context_token text,
  p_mode text,
  p_expected_idempotency_key_hash text default null,
  p_correlation_id uuid default null
)
returns table(
  authorization_context_id uuid,
  actor_user_id uuid,
  tenant_id uuid,
  branch_id uuid,
  actor_role text,
  employee_id uuid,
  authorization_source text,
  idempotency_key_hash text,
  context_version text,
  expires_at timestamptz,
  correlation_id uuid
)
language plpgsql
volatile
parallel unsafe
security definer
set search_path = pg_catalog
as $function$
declare
  v_hash text;
  v_context public.atomic_authorization_contexts%rowtype;
begin
  if p_context_token is null
     or p_context_token !~ '^[0-9a-f]{64}$' then
    raise exception using
      errcode = '22023',
      message = 'CONTEXT_TOKEN_INVALID';
  end if;
  if p_mode not in ('non_consuming_quote','consuming_order') then
    raise exception using
      errcode = '22023',
      message = 'CONTEXT_VALIDATION_MODE_INVALID';
  end if;
  if p_mode = 'consuming_order'
     and (
       p_expected_idempotency_key_hash !~ '^[0-9a-f]{64}$'
       or p_correlation_id is null
     ) then
    raise exception using
      errcode = '22023',
      message = 'CONTEXT_TOKEN_INVALID';
  end if;
  if p_mode = 'non_consuming_quote'
     and (
       p_expected_idempotency_key_hash is not null
       or p_correlation_id is not null
     ) then
    raise exception using
      errcode = '22023',
      message = 'CONTEXT_VALIDATION_MODE_INVALID';
  end if;

  v_hash := encode(extensions.digest(p_context_token, 'sha256'), 'hex');

  if p_mode = 'consuming_order' then
    select * into v_context
    from public.atomic_authorization_contexts c
    where c.context_secret_hash = v_hash
    for update;
  else
    /*
    FOR SHARE blocks consume/revoke until quote issuance commits, but does not
    serialize independent readers. The unique context quote index resolves two
    concurrent quote issuers without creating a second quote.
    */
    select * into v_context
    from public.atomic_authorization_contexts c
    where c.context_secret_hash = v_hash
    for share;
  end if;

  if not found then
    raise exception using errcode = '28000', message = 'CONTEXT_NOT_FOUND';
  end if;
  if v_context.state = 'revoked' then
    raise exception using errcode = '28000', message = 'CONTEXT_REVOKED';
  elsif v_context.state = 'consumed' then
    raise exception using
      errcode = '28000',
      message = 'CONTEXT_ALREADY_CONSUMED';
  elsif v_context.state <> 'issued' then
    raise exception using errcode = '28000', message = 'CONTEXT_NOT_ISSUED';
  end if;
  if v_context.expires_at <= clock_timestamp() then
    raise exception using errcode = '28000', message = 'CONTEXT_EXPIRED';
  end if;
  if v_context.purpose <> 'create_order_atomic_v2' then
    raise exception using
      errcode = '28000',
      message = 'CONTEXT_PURPOSE_INVALID';
  end if;
  if v_context.context_version <> 'atomic-auth-context-v1' then
    raise exception using
      errcode = '28000',
      message = 'CONTEXT_VERSION_INVALID';
  end if;
  if p_mode = 'consuming_order'
     and v_context.idempotency_key_hash
       <> p_expected_idempotency_key_hash then
    raise exception using
      errcode = '28000',
      message = 'CONTEXT_BINDING_INVALID';
  end if;
  if v_context.authorization_source not in (
    'authenticated_user_jwt','pos_pin_server'
  ) then
    raise exception using
      errcode = '28000',
      message = 'CONTEXT_BINDING_INVALID';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_context.authenticated_user_id
      and p.tenant_id = v_context.tenant_id
      and p.is_active = true
  )
  or not exists (
    select 1
    from public.branches b
    where b.id = v_context.branch_id
      and b.tenant_id = v_context.tenant_id
  ) then
    raise exception using
      errcode = '28000',
      message = 'CONTEXT_BINDING_INVALID';
  end if;

  if v_context.authorization_source = 'authenticated_user_jwt'
     and not exists (
       select 1
       from public.profiles p
       where p.id = v_context.authenticated_user_id
         and p.tenant_id = v_context.tenant_id
         and p.is_active = true
         and p.role = v_context.actor_role
         and (
           (
             p.role in ('owner','admin','manager')
             and v_context.profile_employee_id is null
           )
           or
           (
             p.role in ('employee','cashier')
             and p.branch_id = v_context.branch_id
             and v_context.profile_employee_id = p.id
           )
         )
     ) then
    raise exception using
      errcode = '28000',
      message = 'CONTEXT_BINDING_INVALID';
  end if;

  if v_context.authorization_source = 'pos_pin_server'
     and not exists (
       select 1
       from public.pos_profiles pp
       where pp.id = v_context.pos_profile_id
         and pp.tenant_id = v_context.tenant_id
         and pp.branch_id = v_context.branch_id
         and pp.is_active = true
         and pp.role = v_context.actor_role
         and pp.role in ('admin','manager','employee','cashier')
     ) then
    raise exception using
      errcode = '28000',
      message = 'CONTEXT_BINDING_INVALID';
  end if;

  if p_mode = 'consuming_order' then
    update public.atomic_authorization_contexts
    set state = 'consumed',
        used_at = clock_timestamp(),
        consumed_correlation_id = p_correlation_id,
        updated_at = clock_timestamp()
    where context_id = v_context.context_id
      and state = 'issued';

    if not found then
      raise exception using
        errcode = '40001',
        message = 'CONTEXT_CONSUMPTION_CONFLICT';
    end if;
  end if;

  return query select
    v_context.context_id,
    v_context.authenticated_user_id,
    v_context.tenant_id,
    v_context.branch_id,
    v_context.actor_role,
    v_context.employee_id,
    v_context.authorization_source,
    v_context.idempotency_key_hash,
    v_context.context_version,
    v_context.expires_at,
    p_correlation_id;
end;
$function$;

-- ===========================================================================
-- C. STRICT BUSINESS-INTENT NORMALIZATION
-- ===========================================================================

create function public.normalize_authoritative_quote_request_v1(
  p_request jsonb
)
returns jsonb
language plpgsql
immutable
parallel safe
security invoker
set search_path = pg_catalog
as $function$
declare
  v_unknown_key text;
  v_item jsonb;
  v_customer jsonb;
  v_intent text;
  v_payment_method text;
  v_note text;
  v_discount_id text;
  v_cash_received text;
  v_items jsonb;
begin
  if p_request is null then
    raise exception using
      errcode = '22023',
      message = 'QUOTE_REQUEST_REQUIRED';
  end if;
  if jsonb_typeof(p_request) <> 'object'
     or octet_length(p_request::text) > 1114112 then
    raise exception using
      errcode = '22023',
      message = 'QUOTE_REQUEST_INVALID';
  end if;

  select k.key into v_unknown_key
  from jsonb_object_keys(p_request) as k(key)
  where k.key <> all(array[
    'customer','note','items','discount_id','payment_method','cash_received'
  ])
  limit 1;
  if v_unknown_key is not null then
    raise exception using
      errcode = '22023',
      message = 'QUOTE_REQUEST_UNKNOWN_KEYS';
  end if;

  if p_request->'items' is null
     or jsonb_typeof(p_request->'items') <> 'array'
     or jsonb_array_length(p_request->'items') = 0 then
    raise exception using
      errcode = '22023',
      message = 'QUOTE_REQUEST_INVALID';
  end if;
  if jsonb_array_length(p_request->'items') > 100
     or octet_length((p_request->'items')::text) > 1048576 then
    raise exception using
      errcode = '22023',
      message = 'QUOTE_TOO_MANY_ITEMS';
  end if;

  for v_item in
    select value from jsonb_array_elements(p_request->'items')
  loop
    if jsonb_typeof(v_item) <> 'object'
       or exists (
         select 1 from jsonb_object_keys(v_item) as k(key)
         where k.key <> all(array['catalog_item_id','quantity'])
       )
       or coalesce(v_item->>'catalog_item_id','') !~
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
       or coalesce(v_item->>'quantity','') !~ '^[1-9][0-9]{0,4}$' then
      raise exception using
        errcode = '22023',
        message = 'QUOTE_ITEM_INVALID';
    end if;
    if (v_item->>'quantity')::numeric > 10000 then
      raise exception using
        errcode = '22023',
        message = 'QUOTE_QUANTITY_INVALID';
    end if;
  end loop;

  /*
  Aggregate duplicates now so quote issuance, hashing and Package 4S use the
  same deterministic catalog-ID order and quantity representation.
  */
  select jsonb_agg(
    jsonb_build_object(
      'catalog_item_id', grouped.catalog_item_id,
      'quantity', grouped.quantity
    )
    order by grouped.catalog_item_id
  )
  into v_items
  from (
    select
      (i.value->>'catalog_item_id')::uuid catalog_item_id,
      sum((i.value->>'quantity')::integer)::bigint quantity
    from jsonb_array_elements(p_request->'items') i(value)
    group by (i.value->>'catalog_item_id')::uuid
  ) grouped;

  if exists (
    select 1
    from jsonb_array_elements(v_items) i(value)
    where (i.value->>'quantity')::numeric > 10000
  ) then
    raise exception using
      errcode = '22023',
      message = 'QUOTE_QUANTITY_INVALID';
  end if;

  if p_request->'customer' is null
     or jsonb_typeof(p_request->'customer') <> 'object'
     or octet_length((p_request->'customer')::text) > 65536 then
    raise exception using
      errcode = '22023',
      message = 'QUOTE_REQUEST_INVALID';
  end if;
  v_customer := p_request->'customer';
  if exists (
    select 1
    from jsonb_object_keys(v_customer) as k(key)
    where k.key <> all(array[
      'intent','id','record_version','name','phone','email','notes'
    ])
  ) then
    raise exception using
      errcode = '22023',
      message = 'QUOTE_REQUEST_UNKNOWN_KEYS';
  end if;

  v_intent := nullif(btrim(v_customer->>'intent'),'');
  if v_intent not in (
    'reuse_existing','create_new','update_existing'
  ) then
    raise exception using
      errcode = '22023',
      message = 'QUOTE_REQUEST_INVALID';
  end if;
  if nullif(v_customer->>'id','') is not null
     and (v_customer->>'id') !~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
    raise exception using
      errcode = '22023',
      message = 'QUOTE_REQUEST_INVALID';
  end if;
  if nullif(v_customer->>'record_version','') is not null
     and (v_customer->>'record_version') !~ '^[1-9][0-9]{0,18}$' then
    raise exception using
      errcode = '22023',
      message = 'QUOTE_REQUEST_INVALID';
  end if;
  if nullif(btrim(v_customer->>'phone'),'') is null
     or public.normalize_customer_phone_v2(
       nullif(btrim(v_customer->>'phone'),'')
     ) is null
     or length(coalesce(v_customer->>'name','')) > 200
     or length(coalesce(v_customer->>'phone','')) > 32
     or length(coalesce(v_customer->>'email','')) > 320
     or length(coalesce(v_customer->>'notes','')) > 2000 then
    raise exception using
      errcode = '22023',
      message = 'QUOTE_REQUEST_INVALID';
  end if;
  if v_intent = 'create_new'
     and (
       nullif(btrim(v_customer->>'name'),'') is null
       or nullif(v_customer->>'id','') is not null
       or nullif(v_customer->>'record_version','') is not null
     ) then
    raise exception using
      errcode = '22023',
      message = 'QUOTE_REQUEST_INVALID';
  end if;
  if v_intent = 'update_existing'
     and (
       nullif(btrim(v_customer->>'name'),'') is null
       or nullif(v_customer->>'id','') is null
       or nullif(v_customer->>'record_version','') is null
     ) then
    raise exception using
      errcode = '22023',
      message = 'QUOTE_REQUEST_INVALID';
  end if;

  v_payment_method := lower(nullif(btrim(p_request->>'payment_method'),''));
  if v_payment_method = 'cod' then
    v_payment_method := 'on_delivery';
  end if;
  if v_payment_method <> all(array[
    'cash','card','mada','visa','transfer','on_delivery'
  ]) then
    raise exception using
      errcode = '22023',
      message = 'QUOTE_REQUEST_INVALID';
  end if;

  v_discount_id := nullif(p_request->>'discount_id','');
  if v_discount_id is not null
     and v_discount_id !~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
    raise exception using
      errcode = '22023',
      message = 'QUOTE_DISCOUNT_INVALID';
  end if;

  v_cash_received := nullif(p_request->>'cash_received','');
  if v_cash_received is not null
     and v_cash_received !~ '^[0-9]{1,16}([.][0-9]{1,2})?$' then
    raise exception using
      errcode = '22023',
      message = 'QUOTE_REQUEST_INVALID';
  end if;
  if v_payment_method <> 'cash' and v_cash_received is not null
     and round(v_cash_received::numeric,2) <> 0 then
    raise exception using
      errcode = '22023',
      message = 'QUOTE_REQUEST_INVALID';
  end if;

  v_note := nullif(btrim(p_request->>'note'),'');
  if v_note is not null and length(v_note) > 2000 then
    raise exception using
      errcode = '22023',
      message = 'QUOTE_REQUEST_INVALID';
  end if;

  return jsonb_build_object(
    'customer', v_customer,
    'note', v_note,
    'items', v_items,
    'discount_id', v_discount_id,
    'payment_method', v_payment_method,
    'cash_received', v_cash_received
  );
end;
$function$;

-- ===========================================================================
-- D. QUOTE PAYLOAD/HASH VERIFICATION AND IMMUTABILITY
-- ===========================================================================

create function public.verify_authoritative_quote_hash_v1(
  p_quote_payload jsonb,
  p_quote_hash text
)
returns boolean
language sql
immutable
parallel safe
security invoker
set search_path = pg_catalog
as $function$
  select
    p_quote_payload is not null
    and jsonb_typeof(p_quote_payload) = 'object'
    and p_quote_hash ~ '^[0-9a-f]{64}$'
    and encode(
      extensions.digest(p_quote_payload::text, 'sha256'),
      'hex'
    ) = p_quote_hash;
$function$;

create function public.reject_financial_quote_mutation_v1()
returns trigger
language plpgsql
volatile
parallel unsafe
security invoker
set search_path = pg_catalog
as $function$
begin
  raise exception using
    errcode = '55000',
    message = 'FINANCIAL_QUOTE_IMMUTABLE';
end;
$function$;

-- ===========================================================================
-- E. AUTHORITATIVE QUOTE ISSUER
-- ===========================================================================

create function public.issue_authoritative_financial_quote_v1(
  p_context_token text,
  p_business_intent jsonb,
  p_request_trace_id text default null
)
returns jsonb
language plpgsql
volatile
parallel unsafe
security definer
set search_path = pg_catalog
as $function$
declare
  v_auth record;
  v_intent jsonb;
  v_financial_intent jsonb;
  v_command_for_fingerprint jsonb;
  v_financial_result jsonb;
  v_snapshot jsonb;
  v_request_fingerprint text;
  v_quote_payload jsonb;
  v_quote_hash text;
  v_quote_fingerprint text;
  v_quote_id uuid;
  v_customer_id uuid;
  v_created_at timestamptz := clock_timestamp();
  v_expires_at timestamptz;
  v_existing public.financial_quotes%rowtype;
  v_constraint_name text;
  v_actor_type text;
  v_actor_id uuid;
  v_correlation_id text;
  v_financial_error text;
begin
  if p_request_trace_id is not null
     and (
       length(p_request_trace_id) not between 1 and 128
       or p_request_trace_id !~ '^[A-Za-z0-9._:-]+$'
     ) then
    raise exception using
      errcode = '22023',
      message = 'QUOTE_REQUEST_INVALID';
  end if;

  select * into strict v_auth
  from public.validate_atomic_authorization_context_internal_v1(
    p_context_token,
    'non_consuming_quote',
    null,
    null
  );

  v_intent := public.normalize_authoritative_quote_request_v1(
    p_business_intent
  );

  v_financial_intent := jsonb_build_object(
    'items', v_intent->'items',
    'discount_id', v_intent->'discount_id',
    'payment_method', v_intent->'payment_method',
    'cash_received', v_intent->'cash_received'
  );
  v_command_for_fingerprint := jsonb_build_object(
    'command_type', 'create_order',
    'branch_id', v_auth.branch_id,
    'customer', v_intent->'customer',
    'note', v_intent->'note'
  );

  /*
  Quote issuance does not create/update a customer. It still proves any
  caller-referenced existing customer belongs to the context tenant and that
  the optimistic version required by update_existing is current.
  */
  if nullif(v_intent->'customer'->>'id','') is not null then
    v_customer_id := (v_intent->'customer'->>'id')::uuid;
    if not exists (
      select 1
      from public.customers c
      where c.id = v_customer_id
        and c.tenant_id = v_auth.tenant_id
        and (
          v_intent->'customer'->>'intent' <> 'update_existing'
          or c.record_version =
             (v_intent->'customer'->>'record_version')::bigint
        )
    ) then
      raise exception using
        errcode = '42501',
        message = 'QUOTE_SCOPE_INVALID';
    end if;
  end if;

  v_request_fingerprint := public.build_atomic_request_fingerprint_v2(
    v_command_for_fingerprint,
    v_financial_intent
  );
  if v_request_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception using
      errcode = 'P0001',
      message = 'QUOTE_FINGERPRINT_MISMATCH';
  end if;

  /*
  Same-context/same-intent retry returns the immutable prior quote. A different
  intent never replaces it.
  */
  select * into v_existing
  from public.financial_quotes q
  where q.authorization_context_id = v_auth.authorization_context_id
  for share;
  if found then
    if v_existing.request_fingerprint <> v_request_fingerprint then
      raise exception using
        errcode = '23505',
        message = 'QUOTE_ALREADY_EXISTS_FOR_CONTEXT';
    end if;
    if v_existing.expires_at <= clock_timestamp() then
      raise exception using errcode = '40001', message = 'QUOTE_CONTEXT_INVALID';
    end if;
    if not public.verify_authoritative_quote_hash_v1(
      v_existing.quote_payload,
      v_existing.quote_hash
    ) then
      raise exception using errcode = 'P0001', message = 'QUOTE_HASH_MISMATCH';
    end if;
    return jsonb_build_object(
      'quote_id', v_existing.id,
      'request_fingerprint', v_existing.request_fingerprint,
      'quote_fingerprint', v_existing.quote_fingerprint,
      'quote_hash', v_existing.quote_hash,
      'quote_version', v_existing.quote_version,
      'financial_engine_version', v_existing.financial_engine_version,
      'expires_at', v_existing.expires_at,
      'financial_snapshot', v_existing.quote_payload->'financial_snapshot',
      'canonical_customer_intent', v_intent->'customer',
      'canonical_note', v_intent->'note',
      'canonical_financial_intent', v_financial_intent,
      'replay', true
    );
  end if;

  begin
    v_financial_result := public.derive_atomic_financial_snapshot_v2(
      v_auth.tenant_id,
      v_auth.branch_id,
      v_financial_intent
    );
  exception
    when no_data_found
      or raise_exception
      or invalid_parameter_value
      or insufficient_privilege
      or numeric_value_out_of_range
    then
      get stacked diagnostics v_financial_error = message_text;
      case v_financial_error
        when 'PRICE_NOT_FOUND' then
          raise exception using
            errcode = 'P0002',
            message = 'QUOTE_ITEM_NOT_FOUND';
        when 'PRICE_SCOPE_INVALID' then
          raise exception using
            errcode = '42501',
            message = 'QUOTE_SCOPE_INVALID';
        when 'PRICE_INVALID' then
          raise exception using
            errcode = 'P0001',
            message = 'QUOTE_PRICE_UNAVAILABLE';
        when 'DISCOUNT_INVALID' then
          raise exception using
            errcode = '22023',
            message = 'QUOTE_DISCOUNT_INVALID';
        when 'VAT_INVALID' then
          raise exception using
            errcode = 'P0001',
            message = 'QUOTE_VAT_CONFIGURATION_INVALID';
        when 'INVALID_QUANTITY' then
          raise exception using
            errcode = '22023',
            message = 'QUOTE_QUANTITY_INVALID';
        when 'ITEM_INTENT_INVALID' then
          raise exception using
            errcode = '22023',
            message = 'QUOTE_ITEM_INVALID';
        when 'CART_LIMIT_EXCEEDED' then
          raise exception using
            errcode = '22023',
            message = 'QUOTE_TOO_MANY_ITEMS';
        when 'EMPTY_CART' then
          raise exception using
            errcode = '22023',
            message = 'QUOTE_REQUEST_INVALID';
        when 'PAYMENT_METHOD_INVALID' then
          raise exception using
            errcode = '22023',
            message = 'QUOTE_REQUEST_INVALID';
        when 'PAYMENT_STATE_INVALID' then
          raise exception using
            errcode = '22023',
            message = 'QUOTE_REQUEST_INVALID';
        else
          raise exception using
            errcode = 'P0001',
            message = 'QUOTE_FINANCIAL_CALCULATION_INVALID';
      end case;
  end;
  v_snapshot := v_financial_result->'snapshot';
  if v_snapshot is null
     or jsonb_typeof(v_snapshot) <> 'object'
     or coalesce(v_financial_result->>'snapshot_hash','')
       !~ '^[0-9a-f]{64}$'
     or encode(
       extensions.digest(v_snapshot::text, 'sha256'),
       'hex'
     ) <> v_financial_result->>'snapshot_hash' then
    raise exception using
      errcode = 'P0001',
      message = 'QUOTE_FINANCIAL_CALCULATION_INVALID';
  end if;

  v_expires_at := least(
    v_auth.expires_at,
    v_created_at + interval '5 minutes'
  );
  if v_expires_at <= v_created_at then
    raise exception using errcode = '28000', message = 'CONTEXT_EXPIRED';
  end if;

  v_actor_type := case
    when v_auth.employee_id is null then 'user'
    else 'pos_employee'
  end;
  v_actor_id := coalesce(v_auth.employee_id, v_auth.actor_user_id);
  v_correlation_id := coalesce(
    p_request_trace_id,
    gen_random_uuid()::text
  );

  v_quote_payload := jsonb_build_object(
    'quote_payload_version', 'authoritative-quote-payload-v1',
    'quote_version', 'financial-quote-v1',
    'financial_engine_version', v_snapshot->>'financial_engine_version',
    'request_fingerprint_version', 'atomic-request-fingerprint-v2',
    'request_fingerprint', v_request_fingerprint,
    'authorization_context_id', v_auth.authorization_context_id,
    'issuer_context_version', v_auth.context_version,
    'tenant_id', v_auth.tenant_id,
    'branch_id', v_auth.branch_id,
    'actor_type', v_actor_type,
    'financial_snapshot', v_snapshot,
    'financial_snapshot_hash', v_financial_result->>'snapshot_hash',
    'issued_at', v_created_at,
    'expires_at', v_expires_at
  );
  v_quote_hash := encode(
    extensions.digest(v_quote_payload::text, 'sha256'),
    'hex'
  );
  v_quote_fingerprint := encode(
    extensions.digest(
      jsonb_build_object(
        'quote_fingerprint_version',
          'authoritative-quote-fingerprint-v1',
        'quote_version', 'financial-quote-v1',
        'financial_engine_version',
          v_snapshot->>'financial_engine_version',
        'request_fingerprint', v_request_fingerprint,
        'authorization_context_id', v_auth.authorization_context_id,
        'quote_hash', v_quote_hash
      )::text,
      'sha256'
    ),
    'hex'
  );

  if not public.verify_authoritative_quote_hash_v1(
    v_quote_payload,
    v_quote_hash
  ) then
    raise exception using errcode = 'P0001', message = 'QUOTE_HASH_MISMATCH';
  end if;

  begin
    insert into public.financial_quotes (
      tenant_id,
      branch_id,
      customer_id,
      correlation_id,
      request_fingerprint,
      request_fingerprint_version,
      quote_fingerprint,
      quote_version,
      financial_engine_version,
      pricing_rule_version,
      vat_rule_version,
      discount_rule_version,
      rounding_version,
      quote_snapshot_version,
      quote_classification,
      created_by_actor_type,
      created_by_actor_id,
      quote_payload,
      quote_hash,
      created_at,
      expires_at,
      authorization_context_id,
      issuer_context_version
    ) values (
      v_auth.tenant_id,
      v_auth.branch_id,
      v_customer_id,
      v_correlation_id,
      v_request_fingerprint,
      'atomic-request-fingerprint-v2',
      v_quote_fingerprint,
      'financial-quote-v1',
      v_snapshot->>'financial_engine_version',
      v_snapshot->>'pricing_rule_version',
      v_snapshot->>'vat_rule_version',
      v_snapshot->>'discount_rule_version',
      v_snapshot->>'rounding_version',
      'authoritative-quote-payload-v1',
      'advisory',
      v_actor_type,
      v_actor_id,
      v_quote_payload,
      v_quote_hash,
      v_created_at,
      v_expires_at,
      v_auth.authorization_context_id,
      v_auth.context_version
    )
    returning id into v_quote_id;
  exception
    when unique_violation then
      get stacked diagnostics v_constraint_name = constraint_name;
      if v_constraint_name not in (
        'uq_financial_quotes_authorization_context',
        'uq_financial_quotes_scope'
      ) then
        raise;
      end if;

      select * into v_existing
      from public.financial_quotes q
      where q.authorization_context_id = v_auth.authorization_context_id
      for share;
      if not found
         or v_existing.request_fingerprint <> v_request_fingerprint
         or not public.verify_authoritative_quote_hash_v1(
           v_existing.quote_payload,
           v_existing.quote_hash
         ) then
        raise exception using
          errcode = '23505',
          message = 'QUOTE_ALREADY_EXISTS_FOR_CONTEXT';
      end if;
      if v_existing.expires_at <= clock_timestamp() then
        raise exception using
          errcode = '40001',
          message = 'QUOTE_CONTEXT_INVALID';
      end if;
      return jsonb_build_object(
        'quote_id', v_existing.id,
        'request_fingerprint', v_existing.request_fingerprint,
        'quote_fingerprint', v_existing.quote_fingerprint,
        'quote_hash', v_existing.quote_hash,
        'quote_version', v_existing.quote_version,
        'financial_engine_version', v_existing.financial_engine_version,
        'expires_at', v_existing.expires_at,
        'financial_snapshot', v_existing.quote_payload->'financial_snapshot',
        'canonical_customer_intent', v_intent->'customer',
        'canonical_note', v_intent->'note',
        'canonical_financial_intent', v_financial_intent,
        'replay', true
      );
  end;

  return jsonb_build_object(
    'quote_id', v_quote_id,
    'request_fingerprint', v_request_fingerprint,
    'quote_fingerprint', v_quote_fingerprint,
    'quote_hash', v_quote_hash,
    'quote_version', 'financial-quote-v1',
    'financial_engine_version', v_snapshot->>'financial_engine_version',
    'expires_at', v_expires_at,
    'financial_snapshot', v_snapshot,
    'canonical_customer_intent', v_intent->'customer',
    'canonical_note', v_intent->'note',
    'canonical_financial_intent', v_financial_intent,
    'replay', false
  );
end;
$function$;

create trigger trg_financial_quotes_immutable_v1
before update or delete on public.financial_quotes
for each row execute function public.reject_financial_quote_mutation_v1();

drop policy if exists financial_quotes_core_insert_v1
  on public.financial_quotes;
create policy financial_quotes_core_insert_v1
  on public.financial_quotes
  for insert to afex_core_owner
  with check (
    authorization_context_id is not null
    and issuer_context_version = 'atomic-auth-context-v1'
    and quote_classification = 'advisory'
  );

-- ===========================================================================
-- F. QUOTE-CONTEXT INTEGRATION AND COMBINED READINESS
-- ===========================================================================

-- ===========================================================================
-- J. NON-CONSUMING AUTHORIZATION-CONTEXT VALIDATOR FOR A FUTURE QUOTE ISSUER
-- ===========================================================================

create function public.validate_atomic_authorization_context_for_quote_v1(
  p_context_token text
)
returns table(
  authorization_context_id uuid,
  authenticated_user_id uuid,
  tenant_id uuid,
  branch_id uuid,
  actor_role text,
  employee_id uuid,
  authorization_source text,
  idempotency_key_hash text,
  context_version text,
  expires_at timestamptz
)
language plpgsql
volatile
parallel unsafe
security definer
set search_path = pg_catalog
as $function$
begin
  return query
  select
    shared.authorization_context_id,
    shared.actor_user_id,
    shared.tenant_id,
    shared.branch_id,
    shared.actor_role,
    shared.employee_id,
    shared.authorization_source,
    shared.idempotency_key_hash,
    shared.context_version,
    shared.expires_at
  from public.validate_atomic_authorization_context_internal_v1(
    p_context_token,
    'non_consuming_quote',
    null::text,
    null::uuid
  ) shared;
end;
$function$;

/*
Compatibility note:
Package 5R-B consuming validation, Package 6A-A quote validation and Package
6B quote issuance now delegate to the same shared helper. This wrapper exposes
only its approved legacy return shape and performs no hashing, lookup, state
mutation or error remapping.
*/

-- ===========================================================================
-- L. REAL, READ-ONLY READINESS V2
-- ===========================================================================

create function public.verify_core_v2_activation_readiness_v2(
  p_environment text default 'production',
  p_package_version text default 'core-v2-i5.9',
  p_tenant_id uuid default null,
  p_branch_id uuid default null
)
returns table(
  gate_name text,
  passed boolean,
  blocking boolean,
  detail text
)
language sql
stable
parallel safe
security definer
set search_path = pg_catalog
as $function$
  with control as (
    select *
    from public.core_v2_activation_control
    where singleton_id = true
  ),
  evidence as (
    select e.*
    from public.core_v2_verification_evidence e
    where e.package_version = p_package_version
      and e.environment = p_environment
      and e.completed_at<=statement_timestamp()
      and not exists (
        select 1
        from public.core_v2_verification_evidence superseding
        where superseding.supersedes_evidence_id=e.evidence_id
      )
  ),
  runtime_identity as (
    select
      i.*,
      login_role.oid login_oid,
      login_role.rolcanlogin,
      login_role.rolsuper,
      login_role.rolcreatedb,
      login_role.rolcreaterole,
      login_role.rolinherit,
      login_role.rolreplication,
      login_role.rolbypassrls,
      expected_role.oid expected_oid
    from public.core_v2_managed_identities i
    join pg_roles login_role
      on login_role.rolname = i.database_role_name
    join pg_roles expected_role
      on expected_role.rolname = i.expected_membership_role
    where i.environment = p_environment
      and i.identity_kind = 'runtime'
      and i.active
  ),
  worker_identity as (
    select
      i.*,
      login_role.oid login_oid,
      login_role.rolcanlogin,
      login_role.rolsuper,
      login_role.rolcreatedb,
      login_role.rolcreaterole,
      login_role.rolinherit,
      login_role.rolreplication,
      login_role.rolbypassrls,
      expected_role.oid expected_oid
    from public.core_v2_managed_identities i
    join pg_roles login_role
      on login_role.rolname = i.database_role_name
    join pg_roles expected_role
      on expected_role.rolname = i.expected_membership_role
    where i.environment = p_environment
      and i.identity_kind = 'outbox_worker'
      and i.active
  )
  select *
  from (values
    (
      'dependency_attestation',
      exists (
        select 1 from evidence
        where test_suite_identifier = 'dependency-hash-package-2b-s'
          and result = 'PASS'
          and artifact_hash =
            '009395af590b53c39a33004c3ad63d1e28a176291d5cfbaa6feb9b71329e591d'
      )
      and exists (
        select 1 from evidence
        where test_suite_identifier = 'dependency-hash-package-4t'
          and result = 'PASS'
          and artifact_hash =
            '40900e9e2bed32ef1f3064881081892719037924d19dfb9a6ff37f5d2feecfe7'
      )
      and exists (
        select 1 from evidence
        where test_suite_identifier = 'dependency-hash-package-5r-b'
          and result = 'PASS'
          and artifact_hash =
            'df141eb3ad7c1ff9b9a2ca700a06b4493c524d671b384cf2c4d6a61b0fb569a3'
      )
      and exists (
        select 1 from evidence
        where test_suite_identifier = 'dependency-hash-package-6a'
          and result = 'PASS'
          and artifact_hash =
            '01466f6d61a90bfd56b2c4a40c776c8ce36cd850f9a24f47e89fd6d21e557351'
      ),
      true,
      'Exact approved dependency attestation must be explicitly recorded.'
    ),
    (
      'roles_safe',
      not exists (
        select 1 from pg_roles
        where rolname in (
          'afex_core_owner','afex_context_issuer','afex_outbox_worker',
          'afex_core_runtime','afex_core_activation_owner',
          'afex_core_activation_operator'
        )
        and (
          rolcanlogin or rolsuper or rolcreatedb or rolcreaterole
          or rolinherit or rolreplication or rolbypassrls
        )
      ),
      true,
      'All dedicated roles must remain NOLOGIN and non-privileged.'
    ),
    (
      'managed_runtime_identity',
      (
        select count(*) = 1
        from public.core_v2_managed_identities
        where environment = p_environment
          and identity_kind = 'runtime'
          and active
      )
      and (
        select count(*) = 1
        from runtime_identity i
        where i.expected_membership_role = 'afex_core_runtime'::name
          and i.rolcanlogin
          and not i.rolsuper
          and not i.rolcreatedb
          and not i.rolcreaterole
          and not i.rolinherit
          and not i.rolreplication
          and not i.rolbypassrls
          and (
            select count(*) = 1
            from pg_auth_members m
            where m.member = i.login_oid
          )
          and exists (
            select 1 from pg_auth_members m
            where m.member = i.login_oid
              and m.roleid = i.expected_oid
              and not m.admin_option
              and not m.inherit_option
              and m.set_option
          )
      ),
      true,
      'Exactly one safe active runtime LOGIN; explicit SET ROLE to afex_core_runtime is required.'
    ),
    (
      'managed_worker_identity',
      (
        select count(*) = 1
        from public.core_v2_managed_identities
        where environment = p_environment
          and identity_kind = 'outbox_worker'
          and active
      )
      and (
        select count(*) = 1
        from worker_identity i
        where i.expected_membership_role = 'afex_outbox_worker'::name
          and i.rolcanlogin
          and not i.rolsuper
          and not i.rolcreatedb
          and not i.rolcreaterole
          and not i.rolinherit
          and not i.rolreplication
          and not i.rolbypassrls
          and (
            select count(*) = 1
            from pg_auth_members m
            where m.member = i.login_oid
          )
          and exists (
            select 1 from pg_auth_members m
            where m.member = i.login_oid
              and m.roleid = i.expected_oid
              and not m.admin_option
              and not m.inherit_option
              and m.set_option
          )
      ),
      true,
      'Exactly one safe active worker LOGIN; explicit SET ROLE to afex_outbox_worker is required.'
    ),
    (
      'runtime_direct_tables_closed',
      not has_table_privilege(
        'afex_core_runtime','public.orders','INSERT'
      )
      and not has_table_privilege(
        'afex_core_runtime','public.financial_quotes','SELECT'
      )
      and not has_table_privilege(
        'afex_core_runtime','public.atomic_outbox','SELECT'
      ),
      true,
      'Runtime role must have no direct business/Core table access.'
    ),
    (
      'atomic_entry_disabled',
      not exists (
        select 1
        from (values
          ('PUBLIC'),('anon'),('authenticated'),('service_role'),
          ('afex_core_runtime'),('afex_outbox_worker'),
          ('afex_context_issuer'),('afex_core_activation_operator')
        ) roles(role_name)
        where has_function_privilege(
          role_name,
          'public.create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)',
          'EXECUTE'
        )
      ),
      true,
      'Atomic entry remains ungranted before Package 7 and final action.'
    ),
    (
      'issuers_ungranted',
      not exists (
        select 1
        from (values
          ('PUBLIC'),('anon'),('authenticated'),('service_role'),
          ('afex_core_runtime'),('afex_outbox_worker'),
          ('afex_context_issuer'),('afex_core_activation_operator')
        ) roles(role_name)
        cross join (values
          ('public.issue_atomic_authorization_context_v1(uuid,text,text)'),
          ('public.issue_pos_atomic_authorization_context_v1(text,uuid,text,text)')
        ) functions(signature)
        where has_function_privilege(role_name,signature,'EXECUTE')
      ),
      true,
      'Issuer gateway and rate-limit tests must pass before a separate grant.'
    ),
    (
      'quote_issuer_authoritative',
      exists (
        select 1
        from pg_proc p
        where p.oid=to_regprocedure(
          'public.issue_authoritative_financial_quote_v1(text,jsonb,text)'
        )
          and p.proowner='afex_core_owner'::regrole
          and p.prosecdef
          and p.provolatile='v'
          and p.proconfig=array['search_path=pg_catalog']::text[]
      )
      and exists (
        select 1
        from pg_proc p
        where p.oid=to_regprocedure(
          'public.verify_authoritative_quote_hash_v1(jsonb,text)'
        )
          and p.proowner='afex_core_owner'::regrole
          and not p.prosecdef
          and p.provolatile='i'
          and p.proconfig=array['search_path=pg_catalog']::text[]
      )
      and exists (
        select 1
        from pg_proc p
        where p.oid=to_regprocedure(
          'public.validate_atomic_authorization_context_internal_v1('
          || 'text,text,text,uuid)'
        )
          and p.proowner='afex_core_owner'::regrole
          and p.prosecdef
          and p.provolatile='v'
          and p.proconfig=array['search_path=pg_catalog']::text[]
      )
      and not exists (
        select 1
        from (values
          ('PUBLIC'),('anon'),('authenticated'),('service_role'),
          ('afex_core_runtime'),('afex_outbox_worker'),
          ('afex_context_issuer'),('afex_core_activation_operator')
        ) roles(role_name)
        cross join (values
          ('public.issue_authoritative_financial_quote_v1(text,jsonb,text)'),
          ('public.verify_authoritative_quote_hash_v1(jsonb,text)'),
          ('public.validate_atomic_authorization_context_internal_v1(text,text,text,uuid)')
        ) functions(signature)
        where has_function_privilege(role_name,signature,'EXECUTE')
      )
      and not exists (
        select 1
        from (values
          ('PUBLIC'),('anon'),('authenticated'),('service_role'),
          ('afex_core_runtime'),('afex_outbox_worker'),
          ('afex_context_issuer'),('afex_core_activation_operator')
        ) roles(role_name)
        where has_table_privilege(
          role_name,'public.financial_quotes','INSERT'
        )
        or has_table_privilege(
          role_name,'public.financial_quotes','UPDATE'
        )
        or has_table_privilege(
          role_name,'public.financial_quotes','DELETE'
        )
      )
      and exists (
        select 1
        from pg_index i
        where i.indexrelid=to_regclass(
          'public.uq_financial_quotes_authorization_context'
        )
          and i.indisunique
          and i.indisvalid
          and i.indisready
      )
      and exists (
        select 1
        from pg_constraint c
        where c.conrelid=to_regclass('public.financial_quotes')
          and c.conname='fk_financial_quotes_authorization_context'
          and c.contype='f'
      )
      and exists (
        select 1
        from pg_trigger t
        where t.tgrelid=to_regclass('public.financial_quotes')
          and t.tgname='trg_financial_quotes_immutable_v1'
          and not t.tgisinternal
          and t.tgenabled='O'
          and t.tgfoid=to_regprocedure(
            'public.reject_financial_quote_mutation_v1()'
          )
      )
      and exists (
        select 1 from control c where not c.quote_issuer_enabled
      ),
      true,
      'Package 6B objects must be exact, immutable, internally owned, '
      || 'ungranted and disabled during preparation.'
    ),
    (
      'package4t_financial_parity',
      exists (
        select 1 from evidence
        where test_suite_identifier='financial_snapshot_parity'
          and result='PASS'
          and tenant_id is not distinct from p_tenant_id
          and branch_id is not distinct from p_branch_id
      )
      and exists (
        select 1 from evidence
        where test_suite_identifier='financial_drift_rollback'
          and result='PASS'
          and tenant_id is not distinct from p_tenant_id
          and branch_id is not distinct from p_branch_id
      )
      and exists (
        select 1 from evidence
        where test_suite_identifier=
          'committed_replay_after_configuration_change'
          and result='PASS'
          and tenant_id is not distinct from p_tenant_id
          and branch_id is not distinct from p_branch_id
      ),
      true,
      'Exact Package 4T parity, drift rollback and committed replay evidence.'
    ),
    (
      'package6b_quote_evidence',
      not exists (
        select 1
        from (values
          ('financial_quote_authority'),
          ('quote_hash_integrity'),
          ('quote_immutability'),
          ('context_quote_linkage'),
          ('shared_context_validation'),
          ('quote_concurrency'),
          ('quote_privilege_isolation')
        ) required(test_suite_identifier)
        where not exists (
          select 1 from evidence e
          where e.test_suite_identifier=required.test_suite_identifier
            and e.result='PASS'
            and e.tenant_id is not distinct from p_tenant_id
            and e.branch_id is not distinct from p_branch_id
        )
      ),
      true,
      'Every Package 6B authority, integrity, linkage, concurrency and '
      || 'privilege suite must have exact non-superseded scoped PASS evidence.'
    ),
    (
      'feature_singleton_fail_closed',
      (select count(*) = 1 from control)
      and exists (
        select 1 from control c
        where not c.global_enabled
          and c.kill_switch
          and not c.pos_enabled
          and not c.admin_orders_enabled
          and not c.quote_issuer_enabled
          and not c.outbox_worker_enabled
          and c.deterministic_canary_percentage = 0
      ),
      true,
      'Preparation state must remain entirely disabled.'
    ),
    (
      'tenant_branch_state_valid',
      not exists (
        select 1
        from public.core_v2_tenant_activation
        where enabled
           or canary_eligible
           or pos_enabled
           or admin_orders_enabled
           or quote_enabled
      )
      and not exists (
        select 1
        from public.core_v2_branch_activation
        where enabled
           or canary_eligible
           or pos_enabled
           or admin_orders_enabled
           or quote_enabled
      ),
      true,
      'No tenant or branch may be enabled during Package 6A preparation.'
    ),
    (
      'package7_pass',
      exists (
        select 1 from evidence
        where test_suite_identifier = 'package-7-full-gate'
          and result = 'PASS'
          and tenant_id is not distinct from p_tenant_id
          and branch_id is not distinct from p_branch_id
      ),
      true,
      'Explicit environment/version/scope Package 7 PASS evidence.'
    ),
    (
      'legacy_mutation_closure',
      exists (
        select 1 from evidence
        where test_suite_identifier = 'legacy-mutation-closure'
          and result = 'PASS'
      ),
      true,
      'Legacy mutation closure must be recorded, not inferred.'
    ),
    (
      'conflicting_trigger_closure',
      exists (
        select 1 from evidence
        where test_suite_identifier = 'conflicting-trigger-closure'
          and result = 'PASS'
      ),
      true,
      'Conflicting trigger closure must be recorded.'
    ),
    (
      'package3_evidence',
      exists (
        select 1 from evidence
        where test_suite_identifier = 'package-3-evidence'
          and result = 'PASS'
      ),
      true,
      'Package 3 evidence/backfill review must be recorded.'
    ),
    (
      'public_helpers_closed',
      not exists (
        select 1
        from (values
          ('PUBLIC'),('anon'),('authenticated'),('service_role'),
          ('afex_core_runtime'),('afex_outbox_worker'),
          ('afex_context_issuer'),('afex_core_activation_operator')
        ) roles(role_name)
        cross join (values
          ('public.validate_atomic_authorization_context_for_quote_v1(text)'),
          ('public.validate_atomic_authorization_context_internal_v1(text,text,text,uuid)'),
          ('public.check_and_record_core_v2_issuer_rate_limit_v1(text,uuid,uuid,uuid,text,boolean)')
        ) functions(signature)
        where has_function_privilege(role_name,signature,'EXECUTE')
      ),
      true,
      'Internal Package 6A helpers must have no PUBLIC execution.'
    ),
    (
      'service_role_not_managed_identity',
      not exists (
        select 1
        from public.core_v2_managed_identities
        where database_role_name = 'service_role'::name
      ),
      true,
      'Generic service_role cannot represent a managed runtime identity.'
    )
  ) gates(gate_name, passed, blocking, detail)
  order by gate_name;
$function$;

-- ===========================================================================
-- G. OWNERSHIP, RLS AND EXECUTION CLOSURE
-- ===========================================================================

alter function public.validate_atomic_authorization_context_internal_v1(
  text,text,text,uuid
) owner to afex_core_owner;
alter function public.normalize_authoritative_quote_request_v1(jsonb)
  owner to afex_core_owner;
alter function public.verify_authoritative_quote_hash_v1(jsonb,text)
  owner to afex_core_owner;
alter function public.reject_financial_quote_mutation_v1()
  owner to afex_core_owner;
alter function public.issue_authoritative_financial_quote_v1(text,jsonb,text)
  owner to afex_core_owner;
alter function public.validate_atomic_authorization_context_for_quote_v1(text)
  owner to afex_core_owner;
alter function public.verify_core_v2_activation_readiness_v2(
  text,text,uuid,uuid
) owner to afex_core_activation_owner;

/*
Package 5R-B grants afex_core_owner SELECT on financial_quotes. Package 6B
adds only INSERT plus a matching narrow RLS policy. No runtime role receives
table access.
*/
grant insert on table public.financial_quotes to afex_core_owner;

revoke all on table public.financial_quotes
from public, anon, authenticated, service_role, afex_core_runtime,
  afex_outbox_worker, afex_context_issuer, afex_core_activation_operator;

revoke execute on function
  public.validate_atomic_authorization_context_internal_v1(
    text,text,text,uuid
  ),
  public.normalize_authoritative_quote_request_v1(jsonb),
  public.verify_authoritative_quote_hash_v1(jsonb,text),
  public.reject_financial_quote_mutation_v1(),
  public.issue_authoritative_financial_quote_v1(text,jsonb,text),
  public.validate_atomic_authorization_context_for_quote_v1(text),
  public.verify_core_v2_activation_readiness_v2(text,text,uuid,uuid)
from public, anon, authenticated, service_role, afex_core_runtime,
  afex_outbox_worker, afex_context_issuer, afex_core_activation_operator;

do $package6b_integration_contract_assertion$
declare
  v_validator oid := to_regprocedure(
    'public.validate_atomic_authorization_context_for_quote_v1(text)'
  );
  v_readiness oid := to_regprocedure(
    'public.verify_core_v2_activation_readiness_v2(text,text,uuid,uuid)'
  );
begin
  if v_validator is null or v_readiness is null then
    raise exception using
      errcode = '55000',
      message = 'PACKAGE6B_INTEGRATION_SIGNATURE_MISSING';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (
        (
          p.proname = 'validate_atomic_authorization_context_for_quote_v1'
          and p.oid <> v_validator
        )
        or (
          p.proname = 'verify_core_v2_activation_readiness_v2'
          and p.oid <> v_readiness
        )
      )
  ) then
    raise exception using
      errcode = '55000',
      message = 'PACKAGE6B_INTEGRATION_UNEXPECTED_OVERLOAD';
  end if;

  if pg_get_function_result(v_validator) is distinct from
    'TABLE(authorization_context_id uuid, authenticated_user_id uuid, '
    || 'tenant_id uuid, branch_id uuid, actor_role text, employee_id uuid, '
    || 'authorization_source text, idempotency_key_hash text, '
    || 'context_version text, expires_at timestamp with time zone)'
  or not exists (
    select 1
    from pg_proc p
    where p.oid = v_validator
      and p.proowner = 'afex_core_owner'::regrole
      and p.prosecdef
      and p.provolatile = 'v'
      and p.proconfig = array['search_path=pg_catalog']::text[]
  )
  or not exists (
    select 1
    from pg_proc p
    where p.oid = v_readiness
      and p.proowner = 'afex_core_activation_owner'::regrole
      and p.prosecdef
      and p.provolatile = 's'
      and p.prolang = (select oid from pg_language where lanname = 'sql')
      and p.proconfig = array['search_path=pg_catalog']::text[]
  ) then
    raise exception using
      errcode = '55000',
      message = 'PACKAGE6B_INTEGRATION_CONTRACT_MISMATCH';
  end if;
end;
$package6b_integration_contract_assertion$;

commit;

-- ===========================================================================
-- H. READ-ONLY STATIC VERIFICATION
-- ===========================================================================

with validator as (
  select pg_get_functiondef(
    'public.validate_atomic_authorization_context_for_quote_v1(text)'
      ::regprocedure
  ) body
)
select
  (
    select count(*)
    from regexp_matches(
      body,
      'public[.]validate_atomic_authorization_context_internal_v1[(]',
      'g'
    )
  )=1 as shared_helper_called_once,
  (
    select count(*)
    from regexp_matches(body,'''non_consuming_quote''','g')
  )=1 as non_consuming_mode_exact,
  body not like '%extensions.digest(%' as no_duplicate_token_hashing,
  body not like '%from public.atomic_authorization_contexts%'
    as no_duplicate_context_lookup,
  body not like '%update public.atomic_authorization_contexts%'
    as no_context_update,
  body not like '%when others%' as errors_propagate,
  pg_get_function_result(
    'public.validate_atomic_authorization_context_for_quote_v1(text)'
      ::regprocedure
  )=
    'TABLE(authorization_context_id uuid, authenticated_user_id uuid, '
    || 'tenant_id uuid, branch_id uuid, actor_role text, employee_id uuid, '
    || 'authorization_source text, idempotency_key_hash text, '
    || 'context_version text, expires_at timestamp with time zone)'
    as return_shape_preserved
from validator;

-- ===========================================================================
-- H. CONTINUED READ-ONLY STATIC VERIFICATION
-- ===========================================================================

with required(signature, expected_owner, expected_security_definer) as (values
  (
    'public.validate_atomic_authorization_context_internal_v1(text,text,text,uuid)',
    'afex_core_owner',
    true
  ),
  (
    'public.normalize_authoritative_quote_request_v1(jsonb)',
    'afex_core_owner',
    false
  ),
  (
    'public.verify_authoritative_quote_hash_v1(jsonb,text)',
    'afex_core_owner',
    false
  ),
  (
    'public.reject_financial_quote_mutation_v1()',
    'afex_core_owner',
    false
  ),
  (
    'public.issue_authoritative_financial_quote_v1(text,jsonb,text)',
    'afex_core_owner',
    true
  )
)
select
  r.signature,
  p.oid is not null as exists,
  p.proowner::regrole::text = r.expected_owner as owner_correct,
  p.prosecdef = r.expected_security_definer as security_mode_correct,
  p.proconfig = array['search_path=pg_catalog']::text[]
    as search_path_correct
from required r
left join pg_proc p on p.oid = to_regprocedure(r.signature)
order by r.signature;

with functions(signature) as (values
  ('public.validate_atomic_authorization_context_internal_v1(text,text,text,uuid)'),
  ('public.normalize_authoritative_quote_request_v1(jsonb)'),
  ('public.verify_authoritative_quote_hash_v1(jsonb,text)'),
  ('public.reject_financial_quote_mutation_v1()'),
  ('public.issue_authoritative_financial_quote_v1(text,jsonb,text)')
),
roles(role_name) as (values
  ('PUBLIC'),('anon'),('authenticated'),('service_role'),
  ('afex_core_runtime'),('afex_outbox_worker'),('afex_context_issuer'),
  ('afex_core_activation_operator')
)
select
  role_name,
  signature,
  has_function_privilege(role_name, signature, 'EXECUTE') as can_execute
from roles cross join functions
order by role_name, signature;

select
  r.rolname,
  has_table_privilege(r.rolname,'public.financial_quotes','SELECT')
    as can_select,
  has_table_privilege(r.rolname,'public.financial_quotes','INSERT')
    as can_insert,
  has_table_privilege(r.rolname,'public.financial_quotes','UPDATE')
    as can_update,
  has_table_privilege(r.rolname,'public.financial_quotes','DELETE')
    as can_delete
from pg_roles r
where r.rolname in (
  'anon','authenticated','service_role','afex_core_runtime',
  'afex_outbox_worker','afex_context_issuer',
  'afex_core_activation_operator','afex_core_owner'
)
order by r.rolname;

select
  t.tgname,
  t.tgenabled,
  p.oid::regprocedure as trigger_function
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'public.financial_quotes'::regclass
  and not t.tgisinternal
order by t.tgname;

select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'financial_quotes'
order by policyname;

select
  to_regclass('public.uq_financial_quotes_authorization_context')
    is not null as one_quote_per_context_index_exists,
  to_regprocedure(
    'public.issue_authoritative_financial_quote_v1(text,jsonb,text)'
  ) is not null as quote_issuer_exists,
  not has_function_privilege(
    'afex_core_runtime',
    'public.issue_authoritative_financial_quote_v1(text,jsonb,text)',
    'EXECUTE'
  ) as runtime_quote_issuer_disabled,
  not has_function_privilege(
    'authenticated',
    'public.issue_authoritative_financial_quote_v1(text,jsonb,text)',
    'EXECUTE'
  ) as browser_quote_issuer_disabled,
  not has_function_privilege(
    'service_role',
    'public.issue_authoritative_financial_quote_v1(text,jsonb,text)',
    'EXECUTE'
  ) as service_role_quote_issuer_disabled;

-- ===========================================================================
-- H. READ-ONLY FINANCIAL PARITY FIXTURE CONTRACT
-- ===========================================================================

/*
Package 7 must create fixtures in an isolated transaction/tenant and roll them
back. No production fixture DML belongs in Package 6B.

For each fixture, compare:

  public.derive_atomic_financial_snapshot_v2(
    fixture.tenant_id,
    fixture.branch_id,
    fixture.financial_intent
  )

with the quote issuer's returned financial_snapshot using exact JSONB and
lowercase SHA-256 equality. Required fixtures:

1  one catalog-default item
2  multiple catalog-default items
3  active branch override
4  no branch override -> catalog fallback
5  inactive/unavailable catalog item
6  percentage discount
7  fixed discount
8  fixed discount equal to subtotal
9  no discount
10 VAT 0%
11 VAT 5%
12 VAT 10%
13 VAT 15%
14 integer quantity boundary 10000
15 half-cent/rounding boundary
16 duplicated catalog ID aggregation
17 inactive/deleted catalog item
18 cross-tenant catalog item
19 inactive/deleted discount
20 quote expiry
21 context expiry/revoke/consume
22 quote/context mismatch
23 same-context same-intent retry
24 same-context different-intent conflict

The current schema and Package 4S support integer quantities only. Fractional
quantity parity is not an applicable Release 1 fixture and must be rejected.
*/

-- ===========================================================================
-- I. PACKAGE 4T / 5R-B / 6A-A / PACKAGE 7 HANDOFF
-- ===========================================================================

/*
PACKAGE 4S COMPATIBILITY
------------------------
- request fingerprint uses build_atomic_request_fingerprint_v2 directly;
- quote context/version, tenant and branch exactly match consumed context;
- quote payload hash uses identical jsonb::text + SHA-256 verification;
- expiry is no later than the context;
- Package 4S re-derives authoritative financial state and never commits the
  advisory payload as legal truth;
- committed idempotency replay occurs before quote lookup/financial stages.

PACKAGE 4T REQUIRED AMENDMENT
-----------------------------
No financial-rule amendment is required. A narrow follow-up is mandatory
before activation because Package 4S re-derives current financial state but
does not compare that result with the quote's embedded financial snapshot.
Package 4T must:
1. replace direct consume call with shared helper consuming_order mode;
2. verify quote_version/financial_engine_version/quote_snapshot_version
   explicitly against the frozen Package 6B constants;
3. verify the quote payload's embedded request fingerprint/context ID/hash
   labels before derivation;
4. compare the newly derived snapshot and snapshot hash exactly with
   quote_payload.financial_snapshot and financial_snapshot_hash, raising
   FINANCIAL_CONFIGURATION_CHANGED on any difference.
The existing signature remains unchanged.

PACKAGE 5R-B REQUIRED AMENDMENT
-------------------------------
Replace the body-level validation in
consume_atomic_authorization_context_v1(text,text,uuid) with a call to
validate_atomic_authorization_context_internal_v1 using consuming_order mode.
Preserve the public signature, return contract, stable errors, transactional
state update, ownership and all current revocations. Update dependency hashes.

PACKAGE 6A-A REQUIRED AMENDMENT
-------------------------------
Replace validate_atomic_authorization_context_for_quote_v1(text) with a thin
delegate to validate_atomic_authorization_context_internal_v1 using
non_consuming_quote mode. Update readiness V2 so quote authority passes only
when:
- exact issuer signature exists;
- owner/search_path/security mode are correct;
- no PUBLIC/browser/runtime/service/worker EXECUTE exists;
- direct financial_quotes writes remain closed;
- quote_issuer_enabled remains false during preparation;
- exact Package 7 quote-suite PASS evidence exists.

APPLICATION HANDOFF
-------------------
Future application integration only:
1. obtain a fresh context through the approved rate-limited issuer;
2. call issue_authoritative_financial_quote_v1 with business intent only;
3. receive quote ID, fingerprints, hash and authoritative financial snapshot;
4. construct Package 4S command using the same canonical customer/note and
   financial intent returned/used for the quote;
5. never send browser totals as authority;
6. retry same context only while valid; a new non-committed context gets a new
   quote; committed idempotency replay uses fresh authentication but no new
   financial execution;
7. route only after Package 6A server-authoritative gates permit it.

PACKAGE 7 FINANCIAL GATES
-------------------------
- all golden fixtures above with exact numeric/JSON/hash parity;
- unknown-key, size, UUID, quantity and payment bounds;
- context validation modes and rollback behavior;
- two issuers/one context race;
- quote racing consume/revoke/expiry;
- price/discount/VAT row-lock races;
- immutable quote update/delete denial;
- cross-tenant/branch denial;
- every function/table privilege denial;
- context/quote/idempotency replay contract;
- Package 6A rate-limit and disabled-feature state.

CONCURRENCY CONTRACT
--------------------
A Two quote requests/context:
  context FOR SHARE; one unique insert; same intent replays one row, different
  intent returns QUOTE_ALREADY_EXISTS_FOR_CONTEXT.
B Quote vs consumption:
  quote's context FOR SHARE precedes catalog locks; consumer FOR UPDATE waits.
C Revoke while quote waits:
  revoke waits on context; whichever locks first determines stable state.
D Expiry while waiting:
  expiry is rechecked by validator and positive expiry is required at insert.
E/F/G catalog/discount/VAT mutation:
  Package 4S derivation obtains FOR SHARE locks; mutation waits or quote sees
  the committed configuration, never a mixed state during issuance. A change
  committed after issuance and before atomic execution is rejected only after
  mandatory Package 4T exact snapshot/hash comparison; Package 6B must not be
  activated before that amendment.
H Same context/different intent:
  one row; QUOTE_ALREADY_EXISTS_FOR_CONTEXT.
I New context/same idempotency key:
  separate quote allowed; atomic idempotency decides replay/conflict.
J Insert then client timeout:
  same-context/same-intent retry returns immutable existing quote.

SECURITY CONTRACT
-----------------
- caller unit price/subtotal/discount amount/VAT rate/total/hash: rejected as
  unknown keys;
- direct browser, runtime, worker or service_role issuer call: no EXECUTE;
- direct quote insert: no table INSERT;
- cross-tenant catalog/branch/token: Package 4S scope validation rejects;
- token hash supplied as token: hashes again and cannot match stored hash;
- expired/revoked/consumed context: stable context errors;
- fake discount/VAT: only configured ID/database VAT is accepted;
- issued quote update/delete: immutable trigger rejects;
- no raw token, token hash, nonce, PIN or JWT is persisted in quote payload.

QUOTE / REPLAY FINAL CONTRACT
-----------------------------
New attempt:
  new context -> one authoritative quote -> atomic transaction consumes context.
Failed PostgreSQL transaction:
  context consumption rolls back; same valid context/quote may retry.
Committed timeout:
  fresh context authenticates same idempotency key; committed replay returns
  before quote validation and financial calculation; old quote is unchanged.
Non-committed retry with a new context:
  new authoritative quote is required.
*/
