/*
AFEX Core V2 I5.9 — Package 4: Atomic Core
Purpose: define the service-only atomic order engine and internal helpers.
Objects created: normalize_customer_phone_v2, resolve_customer_identity_v2,
resolve_customer_identity_result_v2,
build_atomic_request_fingerprint_v2,
derive_atomic_financial_snapshot_v2,
acquire_idempotency_command_v2, allocate_branch_monthly_number_v2,
assert_atomic_legacy_triggers_safe_v2,
resolve_inventory_requirements_v2, lock_and_validate_inventory_v2,
build_inventory_movement_evidence_v2, apply_inventory_mutations_v2,
atomic_semantic_event_uuid_v1, enqueue_atomic_outbox_v2,
resolve_atomic_authorization_v2, build_atomic_order_response_v1,
create_order_atomic_v2.
Objects modified: none until a function is explicitly invoked.
Execution order: initial Package 4 after Packages 2/3; this 4S replacement
after Package 2B-S and Package 5R, and before Package 6 activation.
Rollback: revoke execution, then drop functions only after V2 is disabled and
no deployed application references them.
Risk: HIGH.
Dependencies: pgcrypto in schema extensions; Package 2 objects and Package 3
validated data. This package grants nothing to browser or service roles.
Estimated lock impact: CREATE FUNCTION takes catalog locks only. Runtime calls
take deterministic row locks documented below.

4S security integration:
- create_order_atomic_v2 retains its four-jsonb signature, but the first
  argument is now a strict envelope containing only an opaque authorization
  context token.
- The legacy resolve_atomic_authorization_v2 helper remains defined and revoked
  solely for Package 5R signature/rollback compatibility. The atomic entry
  point never calls it.
- Every attempt, including committed replay, requires a fresh single-use
  context bound to the same idempotency key hash.

4T authoritative quote snapshot parity amendment:
- Starting Package 4S SHA-256:
  3fe9227acd9af064b1afc9c583ef2946f77c1c4e701a40d307ad6790dfb3245f
- Approved Package 6B SHA-256:
  46c0db2c04a2f48dd1519f72a8f627ca2ceae3ad0ad6af21a7897bc2bc3914ff
- Committed replay remains before quote loading and financial derivation.
- New non-replay executions verify the immutable quote payload/hash and then
  require byte-exact JSONB snapshot and lowercase SHA-256 parity with the
  freshly derived authoritative snapshot.
- No financial rule, persistence stage, inventory stage, number allocation,
  response, audit, outbox, authorization consumption or idempotency ordering
  is changed.
*/

do $security_dependency_preflight$
declare
  v_missing text;
  v_unexpected text;
  v_column_mismatch text;
begin
  if to_regprocedure(
    'public.consume_atomic_authorization_context_v1(text,text,uuid)'
  ) is null then
    raise exception using errcode='55000',
      message='ATOMIC_AUTHORIZATION_CONSUMER_REQUIRED';
  end if;

  with expected(signature) as (values
    ('issue_authoritative_financial_quote_v1(text,jsonb,text)'),
    ('verify_authoritative_quote_hash_v1(jsonb,text)'),
    ('validate_atomic_authorization_context_internal_v1(text,text,text,uuid)')
  )
  select string_agg(signature, ', ' order by signature)
  into v_missing
  from expected
  where to_regprocedure('public.' || signature) is null;

  if v_missing is not null then
    raise exception using
      errcode='55000',
      message='PACKAGE6B_REQUIRED_SIGNATURE_MISSING',
      detail=v_missing;
  end if;

  with expected(proname,identity_args) as (values
    ('issue_authoritative_financial_quote_v1','text, jsonb, text'),
    ('verify_authoritative_quote_hash_v1','jsonb, text'),
    ('validate_atomic_authorization_context_internal_v1',
      'text, text, text, uuid')
  ),
  actual as (
    select p.proname,pg_get_function_identity_arguments(p.oid) identity_args
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (select proname from expected)
  )
  select string_agg(
    format('%I(%s)',a.proname,a.identity_args),
    ', ' order by a.proname,a.identity_args
  )
  into v_unexpected
  from actual a
  left join expected e
    on e.proname=a.proname
   and e.identity_args=a.identity_args
  where e.proname is null;

  if v_unexpected is not null then
    raise exception using
      errcode='55000',
      message='PACKAGE6B_UNEXPECTED_OVERLOAD',
      detail=v_unexpected;
  end if;

  if to_regclass('public.financial_quotes') is null
     or to_regclass('public.atomic_authorization_contexts') is null
     or to_regclass('public.uq_financial_quotes_authorization_context')
        is null
     or not exists (
       select 1
       from pg_constraint c
       where c.conrelid='public.financial_quotes'::regclass
         and c.conname='fk_financial_quotes_authorization_context'
         and c.contype='f'
     ) then
    raise exception using
      errcode='55000',
      message='PACKAGE6B_QUOTE_CONTEXT_CONTRACT_MISSING';
  end if;

  with expected(column_name,data_type,is_nullable) as (values
    ('id','uuid','NO'),
    ('tenant_id','uuid','NO'),
    ('branch_id','uuid','NO'),
    ('request_fingerprint','text','NO'),
    ('request_fingerprint_version','text','NO'),
    ('quote_fingerprint','text','NO'),
    ('quote_version','text','NO'),
    ('financial_engine_version','text','NO'),
    ('pricing_rule_version','text','NO'),
    ('vat_rule_version','text','NO'),
    ('discount_rule_version','text','NO'),
    ('rounding_version','text','NO'),
    ('quote_snapshot_version','text','NO'),
    ('quote_classification','text','NO'),
    ('quote_payload','jsonb','NO'),
    ('quote_hash','text','NO'),
    ('expires_at','timestamp with time zone','NO'),
    ('authorization_context_id','uuid','YES'),
    ('issuer_context_version','text','YES')
  )
  select string_agg(
    format(
      '%I expected %s nullable=%s; found %s nullable=%s',
      e.column_name,e.data_type,e.is_nullable,
      coalesce(c.data_type,'MISSING'),coalesce(c.is_nullable,'MISSING')
    ),
    '; ' order by e.column_name
  )
  into v_column_mismatch
  from expected e
  left join information_schema.columns c
    on c.table_schema='public'
   and c.table_name='financial_quotes'
   and c.column_name=e.column_name
  where c.column_name is null
     or c.data_type<>e.data_type
     or c.is_nullable<>e.is_nullable;

  if v_column_mismatch is not null then
    raise exception using
      errcode='55000',
      message='PACKAGE6B_QUOTE_SCHEMA_MISMATCH',
      detail=v_column_mismatch;
  end if;
end;
$security_dependency_preflight$;

begin;

/*
4S transitional compatibility helper:
- This resolver is obsolete and is not called by create_order_atomic_v2.
- It remains defined, owned and revoked only because approved Package 5R
  currently verifies all 17 Package 4 signatures.
- Package 6 must never grant this helper. A later cleanup package may remove it
  after Package 5R's inventory is amended.
*/
create or replace function public.resolve_atomic_authorization_v2(
  p_claimed_authorization jsonb,
  p_command jsonb
)
returns table (
  actor_user_id uuid,
  tenant_id uuid,
  branch_id uuid,
  actor_role text,
  employee_id uuid,
  authorization_source text,
  authorization_context_id uuid,
  correlation_id uuid
)
language plpgsql
volatile
parallel unsafe
security definer
set search_path = pg_catalog
as $function$
declare
  v_auth_user_id uuid;
  v_profile public.profiles%rowtype;
  v_requested_branch_id uuid;
  v_claimed_employee_id uuid;
  v_claimed_correlation_id uuid;
  v_unknown_key text;
begin
  if p_claimed_authorization is null
     or jsonb_typeof(p_claimed_authorization) <> 'object' then
    raise exception using errcode = '22023', message = 'AUTH_CONTEXT_REQUIRED';
  end if;
  if p_command is null or jsonb_typeof(p_command) <> 'object' then
    raise exception using errcode = '22023', message = 'COMMAND_INVALID';
  end if;

  select k.key into v_unknown_key
  from jsonb_object_keys(p_claimed_authorization) as k(key)
  where k.key <> all(array[
    'user_id','tenant_id','branch_id','employee_id','role','correlation_id'
  ])
  limit 1;
  if v_unknown_key is not null then
    raise exception using errcode = '22023', message = 'AUTH_CONTEXT_INVALID';
  end if;

  v_auth_user_id := auth.uid();
  if v_auth_user_id is null then
    raise exception using errcode = '28000',
      message = 'AUTHENTICATION_REQUIRED';
  end if;

  select p.* into v_profile
  from public.profiles p
  where p.id = v_auth_user_id
  for share;
  if not found then
    raise exception using errcode = '42501', message = 'TENANT_NOT_AUTHORIZED';
  end if;
  if not v_profile.is_active then
    raise exception using errcode = '42501', message = 'ACTOR_NOT_ACTIVE';
  end if;
  if v_profile.tenant_id is null then
    raise exception using errcode = '42501', message = 'TENANT_NOT_AUTHORIZED';
  end if;
  if not exists (
    select 1 from public.tenants t where t.id = v_profile.tenant_id
  ) then
    raise exception using errcode = '42501', message = 'TENANT_NOT_ACTIVE';
  end if;
  if v_profile.role <> all(array[
    'owner','admin','manager','employee','cashier'
  ]) then
    raise exception using errcode = '42501', message = 'ORDER_CREATE_FORBIDDEN';
  end if;

  if coalesce(p_command->>'branch_id','') !~
     '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
    raise exception using errcode = '22023', message = 'AUTH_CONTEXT_INVALID';
  end if;
  v_requested_branch_id := (p_command->>'branch_id')::uuid;

  if not exists (
    select 1
    from public.branches b
    where b.id = v_requested_branch_id
      and b.tenant_id = v_profile.tenant_id
  ) then
    raise exception using errcode = '42501', message = 'BRANCH_NOT_AUTHORIZED';
  end if;
  if not exists (
    select 1
    from public.branches b
    where b.id = v_requested_branch_id
      and b.tenant_id = v_profile.tenant_id
      and b.is_active
  ) then
    raise exception using errcode = '42501', message = 'BRANCH_NOT_ACTIVE';
  end if;
  if v_profile.role = any(array['employee','cashier'])
     and v_profile.branch_id is distinct from v_requested_branch_id then
    raise exception using errcode = '42501', message = 'BRANCH_NOT_AUTHORIZED';
  end if;

  if nullif(p_claimed_authorization->>'user_id','') is not null then
    if (p_claimed_authorization->>'user_id') !~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
       or (p_claimed_authorization->>'user_id')::uuid <> v_auth_user_id then
      raise exception using errcode = '42501', message = 'AUTH_CONTEXT_MISMATCH';
    end if;
  end if;
  if nullif(p_claimed_authorization->>'tenant_id','') is not null then
    if (p_claimed_authorization->>'tenant_id') !~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
       or (p_claimed_authorization->>'tenant_id')::uuid <> v_profile.tenant_id then
      raise exception using errcode = '42501', message = 'AUTH_CONTEXT_MISMATCH';
    end if;
  end if;
  if nullif(p_claimed_authorization->>'branch_id','') is not null then
    if (p_claimed_authorization->>'branch_id') !~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
       or (p_claimed_authorization->>'branch_id')::uuid
          <> v_requested_branch_id then
      raise exception using errcode = '42501', message = 'AUTH_CONTEXT_MISMATCH';
    end if;
  end if;
  if nullif(p_claimed_authorization->>'role','') is not null
     and p_claimed_authorization->>'role' <> v_profile.role then
    raise exception using errcode = '42501', message = 'AUTH_CONTEXT_MISMATCH';
  end if;

  /*
  No database-backed POS session currently binds a pos_profiles row to
  auth.uid(). Only an authenticated employee/cashier profile may be represented
  as the employee, and only by its own authenticated profile ID.
  */
  if nullif(p_claimed_authorization->>'employee_id','') is not null then
    if (p_claimed_authorization->>'employee_id') !~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
      raise exception using errcode = '22023', message = 'AUTH_CONTEXT_INVALID';
    end if;
    v_claimed_employee_id := (p_claimed_authorization->>'employee_id')::uuid;
    if v_profile.role <> all(array['employee','cashier'])
       or v_claimed_employee_id <> v_auth_user_id then
      raise exception using errcode = '42501',
        message = 'EMPLOYEE_NOT_AUTHORIZED';
    end if;
  elsif v_profile.role = any(array['employee','cashier']) then
    v_claimed_employee_id := v_auth_user_id;
  end if;

  if nullif(p_command->>'correlation_id','') is not null then
    if (p_command->>'correlation_id') !~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
      raise exception using errcode = '22023', message = 'CORRELATION_ID_INVALID';
    end if;
  end if;

  if nullif(p_claimed_authorization->>'correlation_id','') is not null
     and (p_claimed_authorization->>'correlation_id') !~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
    raise exception using errcode = '22023',
      message = 'CORRELATION_ID_INVALID';
  end if;
  /*
  Claimed correlation values are transition-only input and never establish
  committed evidence identity. PostgreSQL owns the transaction correlation ID.
  */
  v_claimed_correlation_id := pg_catalog.gen_random_uuid();

  return query select
    v_auth_user_id,
    v_profile.tenant_id,
    v_requested_branch_id,
    v_profile.role,
    v_claimed_employee_id,
    'auth.uid+profiles+branches'::text,
    null::uuid,
    v_claimed_correlation_id;
end;
$function$;

create or replace function public.normalize_customer_phone_v2(p_phone text)
returns text
language plpgsql
immutable
strict
security invoker
set search_path = pg_catalog
as $function$
declare
  v_phone text;
begin
  v_phone := translate(
    btrim(p_phone),
    '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
    '01234567890123456789'
  );
  if v_phone !~ '^[+0-9 ()-]+$' then
    return null;
  end if;
  v_phone := regexp_replace(v_phone, '[ ()-]', '', 'g');
  if v_phone ~ '^05[0-9]{8}$' then
    return '966' || substr(v_phone, 2);
  elsif v_phone ~ '^5[0-9]{8}$' then
    return '966' || v_phone;
  elsif v_phone ~ '^\+9665[0-9]{8}$' then
    return substr(v_phone, 2);
  elsif v_phone ~ '^9665[0-9]{8}$' then
    return v_phone;
  end if;
  return null;
end;
$function$;

create or replace function public.resolve_customer_identity_v2(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_actor_user_id uuid,
  p_customer jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_customer_id uuid;
  v_requested_id uuid;
  v_phone text;
  v_phone_normalized text;
  v_name text;
  v_email text;
  v_notes text;
  v_intent text;
  v_expected_version bigint;
  v_match_ids uuid[];
  v_constraint_name text;
begin
  if p_tenant_id is null or p_branch_id is null then
    raise exception using errcode = '22023',
      message = 'CUSTOMER_SCOPE_INVALID';
  end if;
  if p_customer is null or jsonb_typeof(p_customer) <> 'object' then
    raise exception using errcode = '22023',
      message = 'CUSTOMER_REQUIRED';
  end if;

  if exists (
    select 1
    from jsonb_object_keys(p_customer) as k(key)
    where k.key <> all(array[
      'intent','id','record_version','name','phone','email','notes'
    ])
  ) then
    raise exception using errcode = '22023',
      message = 'CUSTOMER_COMMAND_INVALID';
  end if;

  v_intent := nullif(btrim(p_customer->>'intent'),'');
  if v_intent is null or v_intent = 'no_customer'
     or v_intent <> all(array[
       'reuse_existing','create_new','update_existing'
     ]) then
    raise exception using errcode = '22023',
      message = 'CUSTOMER_INTENT_INVALID';
  end if;

  if nullif(p_customer->>'id','') is not null then
    if (p_customer->>'id') !~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
      raise exception using errcode = '22023',
        message = 'CUSTOMER_COMMAND_INVALID';
    end if;
    v_requested_id := (p_customer->>'id')::uuid;
  end if;
  v_phone := nullif(btrim(p_customer->>'phone'), '');
  v_phone_normalized := public.normalize_customer_phone_v2(v_phone);
  v_name := nullif(btrim(p_customer->>'name'), '');
  v_email := nullif(btrim(p_customer->>'email'),'');
  v_notes := nullif(btrim(p_customer->>'notes'),'');
  if nullif(p_customer->>'record_version','') is not null then
    if (p_customer->>'record_version') !~ '^[1-9][0-9]{0,18}$' then
      raise exception using errcode = '22023',
        message = 'CUSTOMER_COMMAND_INVALID';
    end if;
    v_expected_version := (p_customer->>'record_version')::bigint;
  end if;

  if v_phone_normalized is null then
    raise exception using errcode = '22023',
      message = 'CUSTOMER_PHONE_INVALID';
  end if;
  if v_name is not null and length(v_name) > 200
     or v_phone is not null and length(v_phone) > 32
     or v_email is not null and length(v_email) > 320
     or v_notes is not null and length(v_notes) > 2000 then
    raise exception using errcode = '22023',
      message = 'CUSTOMER_COMMAND_INVALID';
  end if;

  select array_agg(c.id order by c.id)
    into v_match_ids
  from public.customers c
  where c.tenant_id = p_tenant_id
    and c.phone_normalized = v_phone_normalized;
  if coalesce(array_length(v_match_ids,1),0) > 1 then
    raise exception using errcode = '23505',
      message = 'CUSTOMER_DUPLICATE_IDENTITY';
  end if;
  v_customer_id := v_match_ids[1];

  if v_intent = 'reuse_existing' then
    if v_customer_id is null then
      raise exception using errcode = 'P0002',
        message = 'CUSTOMER_NOT_FOUND';
    end if;
    if v_requested_id is not null and v_requested_id <> v_customer_id then
      raise exception using errcode = '23505',
        message = 'CUSTOMER_IDENTITY_CONFLICT';
    end if;
    select c.id into v_customer_id
    from public.customers c
    where c.id = v_customer_id
      and c.tenant_id = p_tenant_id
      and (v_expected_version is null or c.record_version = v_expected_version)
    for update;
    if not found then
      raise exception using errcode = '40001',
        message = 'CUSTOMER_VERSION_CONFLICT';
    end if;
    return v_customer_id;
  end if;

  if v_intent = 'update_existing' then
    if v_requested_id is null or v_expected_version is null then
      raise exception using errcode = '22023',
        message = 'CUSTOMER_COMMAND_INVALID';
    end if;
    select c.id into v_customer_id
    from public.customers c
    where c.id = v_requested_id
      and c.tenant_id = p_tenant_id
      and c.record_version = v_expected_version
    for update;
    if not found then
      raise exception using errcode = '40001',
        message = 'CUSTOMER_VERSION_CONFLICT';
    end if;
    if exists (
      select 1
      from public.customers c
      where c.tenant_id = p_tenant_id
        and c.phone_normalized = v_phone_normalized
        and c.id <> v_requested_id
    ) then
      raise exception using errcode = '23505',
        message = 'CUSTOMER_IDENTITY_CONFLICT';
    end if;
    if v_name is null then
      raise exception using errcode = '22023',
        message = 'CUSTOMER_NAME_REQUIRED';
    end if;
    begin
      update public.customers
      set name = v_name,
          phone = v_phone,
          phone_normalized = v_phone_normalized,
          email = v_email,
          notes = v_notes,
          record_version = record_version + 1
      where id = v_requested_id
        and tenant_id = p_tenant_id
        and record_version = v_expected_version
      returning id into v_customer_id;
    exception
      when unique_violation then
        get stacked diagnostics v_constraint_name = constraint_name;
        if v_constraint_name = any(array[
          'uq_customers_tenant_phone_normalized','customers_phone_key'
        ]) then
          raise exception using errcode = '23505',
            message = 'CUSTOMER_IDENTITY_CONFLICT';
        end if;
        raise;
    end;
    if not found then
      raise exception using errcode = '40001',
        message = 'CUSTOMER_VERSION_CONFLICT';
    end if;
    return v_customer_id;
  end if;

  if v_requested_id is not null or v_expected_version is not null then
    raise exception using errcode = '22023',
      message = 'CUSTOMER_COMMAND_INVALID';
  end if;
  if v_customer_id is not null then
    raise exception using errcode = '23505',
      message = 'CUSTOMER_IDENTITY_CONFLICT';
  end if;
  if v_name is null then
    raise exception using errcode = '22023',
      message = 'CUSTOMER_NAME_REQUIRED';
  end if;

  begin
    insert into public.customers (
      name, phone, phone_normalized, notes, email, created_by,
      branch_id, tenant_id, record_version
    )
    values (
      v_name, v_phone, v_phone_normalized, v_notes, v_email, p_actor_user_id,
      p_branch_id, p_tenant_id, 1
    )
    returning id into v_customer_id;
  exception
    when unique_violation then
      get stacked diagnostics v_constraint_name = constraint_name;
      if v_constraint_name = any(array[
        'uq_customers_tenant_phone_normalized','customers_phone_key'
      ]) then
        raise exception using errcode = '23505',
          message = 'CUSTOMER_IDENTITY_CONFLICT';
      end if;
      raise;
  end;
  return v_customer_id;
end;
$function$;

create or replace function public.resolve_customer_identity_result_v2(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_actor_user_id uuid,
  p_customer_intent jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_customer_id uuid;
  v_intent text;
begin
  if p_customer_intent is null
     or jsonb_typeof(p_customer_intent) <> 'object' then
    raise exception using errcode = '22023',
      message = 'CUSTOMER_COMMAND_INVALID';
  end if;
  v_intent := p_customer_intent->>'intent';
  v_customer_id := public.resolve_customer_identity_v2(
    p_tenant_id,p_branch_id,p_actor_user_id,p_customer_intent
  );
  return jsonb_build_object(
    'customer_id',v_customer_id,
    'customer_was_created',v_intent = 'create_new',
    'customer_was_updated',v_intent = 'update_existing'
  );
end;
$function$;

/*
The request fingerprint is database-authoritative. The caller's fingerprint
field remains accepted for transition compatibility but never establishes
idempotency identity. PostgreSQL jsonb text serialization is deliberately an
internal-only contract: object keys are canonicalized by jsonb, array order is
preserved, numerics use PostgreSQL jsonb representation and JSON null remains
JSON null. Quote creation must use this same database helper/contract.
*/
create or replace function public.build_atomic_request_fingerprint_v2(
  p_command jsonb,
  p_financial_intent jsonb
)
returns text
language sql
immutable
parallel safe
security invoker
set search_path = pg_catalog
as $function$
  select encode(
    extensions.digest(
      jsonb_build_object(
        'fingerprint_version','atomic-request-fingerprint-v2',
        'command_type',p_command->>'command_type',
        'branch_id',p_command->>'branch_id',
        'customer',p_command->'customer',
        'note',case
          when nullif(btrim(p_command->>'note'),'') is null then null
          else btrim(p_command->>'note')
        end,
        'financial_intent',p_financial_intent
      )::text,
      'sha256'
    ),
    'hex'
  );
$function$;

create or replace function public.acquire_idempotency_command_v2(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_command_type text,
  p_key_hash text,
  p_request_fingerprint text,
  p_actor_user_id uuid,
  p_actor_employee_id uuid,
  p_engine_version text,
  p_correlation_id uuid
)
returns public.idempotency_commands
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_command public.idempotency_commands%rowtype;
  v_inserted_id uuid;
  v_new_lease_owner uuid := pg_catalog.gen_random_uuid();
  v_now timestamptz := clock_timestamp();
  v_actor_type text :=
    case when p_actor_employee_id is null then 'user' else 'pos_employee' end;
  v_actor_id uuid := coalesce(p_actor_employee_id,p_actor_user_id);
begin
  if p_tenant_id is null or p_branch_id is null or p_actor_user_id is null
     or p_correlation_id is null or p_command_type <> 'create_order'
     or p_engine_version <> 'atomic-order-v2-r1' then
    raise exception using errcode = '22023',
      message = 'AUTH_CONTEXT_INVALID';
  end if;
  if p_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'IDEMPOTENCY_KEY_INVALID';
  end if;
  if p_request_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'REQUEST_FINGERPRINT_INVALID';
  end if;

  insert into public.idempotency_commands (
    tenant_id, branch_id, command_type, key_hash,
    request_fingerprint, fingerprint_version, state, engine_version,
    actor_type, actor_id, correlation_id, lease_owner, lease_expires_at
  )
  values (
    p_tenant_id, p_branch_id, p_command_type, p_key_hash,
    p_request_fingerprint, 'atomic-request-fingerprint-v2',
    'started', p_engine_version,
    v_actor_type, v_actor_id, p_correlation_id::text,
    v_new_lease_owner::text, v_now + interval '5 minutes'
  )
  on conflict (tenant_id, branch_id, command_type, key_hash)
  do nothing
  returning id into v_inserted_id;

  select * into v_command
  from public.idempotency_commands
  where tenant_id = p_tenant_id
    and branch_id = p_branch_id
    and command_type = p_command_type
    and key_hash = p_key_hash
  for update;

  if not found then
    raise exception using errcode = '40001',
      message = 'IDEMPOTENCY_LEASE_CONFLICT';
  end if;
  if v_command.request_fingerprint <> p_request_fingerprint then
    raise exception using errcode = '23505',
      message = 'IDEMPOTENCY_FINGERPRINT_CONFLICT';
  end if;
  if v_command.engine_version <> p_engine_version then
    raise exception using errcode = '23505',
      message = 'IDEMPOTENCY_ENGINE_CONFLICT';
  end if;
  if v_command.actor_id is distinct from v_actor_id
     or v_command.actor_type is distinct from v_actor_type then
    raise exception using errcode = '42501',
      message = 'IDEMPOTENCY_ACTOR_CONFLICT';
  end if;

  if v_command.state = 'committed' then
    return v_command;
  end if;
  if v_inserted_id is not null then
    return v_command;
  end if;
  if v_command.state = 'failed_terminal' then
    raise exception using errcode = 'P0001',
      message = 'IDEMPOTENCY_TERMINAL_FAILURE';
  end if;
  if v_command.state = 'started'
     and v_command.lease_expires_at > v_now then
    raise exception using errcode = '55P03',
      message = 'IDEMPOTENCY_IN_PROGRESS';
  end if;
  if v_command.state = 'started'
     and (v_command.order_id is not null or v_command.invoice_id is not null) then
    raise exception using errcode = '40001',
      message = 'IDEMPOTENCY_RECOVERY_FORBIDDEN';
  end if;
  if v_command.state <> all(array[
    'started','failed_retryable','expired'
  ]) then
    raise exception using errcode = '40001',
      message = 'IDEMPOTENCY_RECOVERY_FORBIDDEN';
  end if;

  /*
  Release 1 uses Model A: acquisition and sale share one transaction. A later
  failure rolls back this lease transition. Retry/recovery fields only govern
  pre-existing non-committed rows; PostgreSQL autonomous transactions are not
  implied.
  */
  if v_command.state = 'started'
     and v_command.lease_expires_at <= v_now then
    update public.idempotency_commands
    set state = 'expired',
        expires_at = v_now,
        lease_owner = null,
        lease_expires_at = null,
        updated_at = v_now
    where id = v_command.id
      and state = 'started'
      and lease_expires_at <= v_now;
    if not found then
      raise exception using errcode = '40001',
        message = 'IDEMPOTENCY_LEASE_CONFLICT';
    end if;
    v_command.state := 'expired';
  end if;

  update public.idempotency_commands
  set state = 'started',
      correlation_id = p_correlation_id::text,
      lease_owner = v_new_lease_owner::text,
      lease_expires_at = v_now + interval '5 minutes',
      retry_count = retry_count + 1,
      recovery_started_at = v_now,
      recovery_completed_at = null,
      updated_at = v_now,
      failed_at = null,
      last_error_code = null
  where id = v_command.id
    and state <> 'committed'
  returning * into v_command;
  if not found then
    raise exception using errcode = '40001',
      message = 'IDEMPOTENCY_LEASE_CONFLICT';
  end if;
  return v_command;
end;
$function$;

/*
The same immutable response builder is used for first success and replay.
It reads only committed order/invoice columns and excludes mutable status,
customer/catalog lookups, timestamps and outbox delivery state.
*/
create or replace function public.build_atomic_order_response_v1(
  p_order_id uuid,
  p_invoice_id uuid
)
returns jsonb
language plpgsql
stable
parallel safe
security definer
set search_path = pg_catalog
as $function$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'order_id',o.id,
    'order_number',o.order_number,
    'invoice_id',i.id,
    'invoice_number',i.invoice_number,
    'customer_id',o.customer_id,
    'total',i.total,
    'currency',i.currency_code,
    'response_version','atomic-order-response-v1'
  )
  into v_result
  from public.orders o
  join public.invoices i
    on i.id = p_invoice_id
   and i.order_id = o.id
   and i.tenant_id = o.tenant_id
   and i.branch_id = o.branch_id
  where o.id = p_order_id;

  if v_result is null then
    raise exception using errcode = 'P0001',
      message = 'IDEMPOTENCY_REPLAY_INVALID';
  end if;
  return v_result;
end;
$function$;

create or replace function public.allocate_branch_monthly_number_v2(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_period_start date
)
returns text
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_prefix text;
  v_stored integer;
  v_next integer;
begin
  if p_tenant_id is null or p_branch_id is null or p_period_start is null
     or p_period_start <> date_trunc('month',p_period_start)::date then
    raise exception using errcode = '22023',
      message = 'NUMBER_SCOPE_INVALID';
  end if;
  select b.order_number_prefix into v_prefix
  from public.branches b
  where b.id = p_branch_id
    and b.tenant_id = p_tenant_id
    and b.is_active
  for share;
  if not found then
    raise exception using errcode = '42501',
      message = 'NUMBER_SCOPE_INVALID';
  end if;
  if v_prefix is null or v_prefix !~ '^[0-9]{2}$' then
    raise exception using errcode = '22023',
      message = 'NUMBER_PREFIX_INVALID';
  end if;

  /*
  last_sequence means the last value already allocated. The first monthly row
  starts at zero; after the explicit row lock, the first allocation becomes 1.
  The primary key makes concurrent first-row insertion safe.
  */
  insert into public.order_number_sequences (
    tenant_id, branch_id, sequence_month, last_sequence
  )
  values (p_tenant_id, p_branch_id, p_period_start, 0)
  on conflict (tenant_id, branch_id, sequence_month) do nothing;

  select s.last_sequence into v_stored
  from public.order_number_sequences s
  where s.tenant_id = p_tenant_id
    and s.branch_id = p_branch_id
    and s.sequence_month = p_period_start
  for update;
  if not found then
    raise exception using errcode = 'P0001',
      message = 'NUMBER_ALLOCATION_FAILED';
  end if;
  if v_stored < 0 or v_stored = 2147483647 then
    raise exception using errcode = '22003',
      message = 'NUMBER_SEQUENCE_INVALID';
  end if;

  update public.order_number_sequences
  set last_sequence = v_stored + 1,
      updated_at = clock_timestamp()
  where tenant_id = p_tenant_id
    and branch_id = p_branch_id
    and sequence_month = p_period_start
    and last_sequence = v_stored
  returning last_sequence into v_next;
  if not found or v_next <> v_stored + 1 then
    raise exception using errcode = 'P0001',
      message = 'NUMBER_ALLOCATION_FAILED';
  end if;
  return v_prefix || '-' || case
    when length(v_next::text) >= 4 then v_next::text
    else lpad(v_next::text, 4, '0')
  end;
end;
$function$;

/*
Package 6 activation must disable the two legacy triggers that independently
allocate numbers or deduct stock. Package 4 fails closed while either trigger
is enabled; it never silently runs both engines.
*/
create or replace function public.assert_atomic_legacy_triggers_safe_v2()
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
  v_inventory_trigger_source text;
  v_number_trigger_source text;
begin
  select lower(p.prosrc) into v_inventory_trigger_source
  from pg_trigger t
  join pg_proc p on p.oid = t.tgfoid
  where t.tgrelid = 'public.invoice_items'::regclass
    and t.tgname = 'trg_deduct_inventory_on_invoice_item_insert'
    and not t.tgisinternal
    and t.tgenabled <> 'D';
  if found and (
    v_inventory_trigger_source not like
      '%v_engine = ''atomic-order-v2-r1''%'
    or v_inventory_trigger_source not like
      '%if v_engine = ''atomic-order-v2-r1'' then%return new;%'
  ) then
    raise exception using errcode = '55000',
      message = 'INVENTORY_DOUBLE_DEDUCTION_RISK';
  end if;

  select lower(p.prosrc) into v_number_trigger_source
  from pg_trigger t
  join pg_proc p on p.oid = t.tgfoid
  where t.tgrelid = 'public.orders'::regclass
    and t.tgname = 'trg_zzzz_set_order_number_branch_monthly'
    and not t.tgisinternal
    and t.tgenabled <> 'D';
  if found and (
    v_number_trigger_source not like
      '%new.atomic_engine_version = ''atomic-order-v2-r1''%'
    or v_number_trigger_source not like
      '%if new.atomic_engine_version = ''atomic-order-v2-r1'' then%return new;%'
  ) then
    raise exception using errcode = '55000',
      message = 'NUMBER_ALLOCATION_FAILED';
  end if;
end;
$function$;

create or replace function public.resolve_inventory_requirements_v2(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_input_count integer;
  v_distinct_count integer;
  v_invalid_catalog_id uuid;
  v_total_tracked bigint;
  v_requirements jsonb;
begin
  if p_tenant_id is null or p_branch_id is null
     or p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) > 100 then
    raise exception using errcode = '22023', message = 'INVENTORY_ITEMS_INVALID';
  end if;

  /*
  This input is the database-derived financial item set, not browser JSON.
  Validate every cast boundary anyway so direct helper calls fail cleanly.
  */
  if exists (
    select 1
    from jsonb_array_elements(p_items) i(value)
    where jsonb_typeof(i.value) <> 'object'
       or coalesce(i.value->>'catalog_item_id','') !~
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
       or coalesce(i.value->>'quantity','') !~ '^[1-9][0-9]{0,4}$'
       or coalesce(i.value->>'line_number','') !~ '^[1-9][0-9]{0,2}$'
       or jsonb_typeof(coalesce(
            i.value->'source_line_numbers','[]'::jsonb
          )) <> 'array'
  ) then
    raise exception using errcode = '22023',
      message = 'INVENTORY_QUANTITY_INVALID';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_items) i(value)
    where (i.value->>'quantity')::numeric > 10000
       or (i.value->>'line_number')::integer > 100
  ) then
    raise exception using errcode = '22023',
      message = 'INVENTORY_QUANTITY_INVALID';
  end if;

  select count(*),count(distinct (i.value->>'catalog_item_id')::uuid)
  into v_input_count,v_distinct_count
  from jsonb_array_elements(p_items) i(value);
  if v_input_count <> v_distinct_count then
    raise exception using errcode = '22023',
      message = 'INVENTORY_ITEMS_INVALID';
  end if;

  /*
  Re-resolve classification from authoritative catalog rows and prove it agrees
  with the financial snapshot. No caller-provided tracking flag is consumed.
  */
  with input_items as (
    select (i.value->>'catalog_item_id')::uuid as catalog_item_id
    from jsonb_array_elements(p_items) i(value)
  )
  select x.catalog_item_id into v_invalid_catalog_id
  from input_items x
  join public.catalog_items c on c.id = x.catalog_item_id
  where c.tenant_id is distinct from p_tenant_id
  order by x.catalog_item_id
  limit 1;
  if v_invalid_catalog_id is not null then
    raise exception using errcode = '42501',
      message = 'INVENTORY_SCOPE_INVALID';
  end if;

  v_invalid_catalog_id := null;
  with input_items as (
    select
      (i.value->>'catalog_item_id')::uuid as catalog_item_id,
      (i.value->>'quantity')::integer as required_quantity,
      (i.value->>'line_number')::integer as line_number,
      i.value->'source_line_numbers' as source_line_numbers,
      i.value->>'inventory_tracking_mode' as snapshot_tracking_mode
    from jsonb_array_elements(p_items) i(value)
  )
  select x.catalog_item_id into v_invalid_catalog_id
  from input_items x
  left join public.catalog_items c on c.id = x.catalog_item_id
  where c.id is null
     or c.tenant_id is distinct from p_tenant_id
     or c.is_active is not true
     or c.deleted_at is not null
     or c.item_type is null
     or c.track_inventory is null
     or (c.is_composite and not c.track_inventory)
     or c.item_type <> all(array['product','service'])
     or x.snapshot_tracking_mode is distinct from case
       when c.item_type = 'service' then 'service'
       when c.track_inventory then 'tracked_product'
       else 'untracked_product'
     end
  order by x.catalog_item_id
  limit 1;
  if v_invalid_catalog_id is not null then
    raise exception using errcode = '22023',
      message = 'INVENTORY_CLASSIFICATION_INVALID';
  end if;

  with input_items as (
    select
      (i.value->>'catalog_item_id')::uuid as catalog_item_id,
      (i.value->>'quantity')::integer as required_quantity,
      (i.value->>'line_number')::integer as line_number,
      i.value->'source_line_numbers' as source_line_numbers
    from jsonb_array_elements(p_items) i(value)
  ),
  authoritative as (
    select
      x.*,c.item_type,c.track_inventory,
      case
        when c.item_type = 'service' then 'service'
        when c.track_inventory then 'tracked_product'
        else 'untracked_product'
      end as tracking_mode
    from input_items x
    join public.catalog_items c
      on c.id = x.catalog_item_id and c.tenant_id = p_tenant_id
  )
  select
    coalesce(sum(required_quantity) filter (
      where tracking_mode = 'tracked_product'
    ),0),
    coalesce(jsonb_agg(jsonb_build_object(
      'tenant_id',p_tenant_id,
      'branch_id',p_branch_id,
      'catalog_item_id',catalog_item_id,
      'total_required_quantity',required_quantity,
      'tracking_mode',tracking_mode,
      'representative_line_number',line_number,
      'source_line_numbers',source_line_numbers
    ) order by catalog_item_id) filter (
      where tracking_mode = 'tracked_product'
    ),'[]'::jsonb)
  into v_total_tracked,v_requirements
  from authoritative;

  if v_total_tracked > 100000 then
    raise exception using errcode = '22023',
      message = 'INVENTORY_QUANTITY_INVALID';
  end if;
  return jsonb_build_object(
    'version','inventory-requirements-v1',
    'tracked_item_count',jsonb_array_length(v_requirements),
    'total_tracked_quantity',v_total_tracked,
    'requirements',v_requirements
  );
end;
$function$;

create or replace function public.lock_and_validate_inventory_v2(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_requirement_set jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_requirement_count integer;
  v_distinct_requirement_count integer;
  v_missing uuid;
  v_ambiguous uuid;
  v_locked_row record;
  v_locked_rows jsonb := '[]'::jsonb;
  v_locked jsonb;
begin
  if p_tenant_id is null or p_branch_id is null
     or p_requirement_set is null
     or jsonb_typeof(p_requirement_set) <> 'object'
     or p_requirement_set->>'version' <> 'inventory-requirements-v1'
     or jsonb_typeof(p_requirement_set->'requirements') <> 'array' then
    raise exception using errcode = '22023',
      message = 'INVENTORY_ITEMS_INVALID';
  end if;
  v_requirement_count :=
    jsonb_array_length(p_requirement_set->'requirements');
  if exists (
    select 1
    from jsonb_array_elements(p_requirement_set->'requirements') r(value)
    where jsonb_typeof(r.value) <> 'object'
       or coalesce(r.value->>'catalog_item_id','') !~
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
       or (r.value->>'tenant_id') is distinct from p_tenant_id::text
       or (r.value->>'branch_id') is distinct from p_branch_id::text
       or (r.value->>'tracking_mode') is distinct from 'tracked_product'
       or coalesce(r.value->>'total_required_quantity','') !~
          '^[1-9][0-9]{0,4}$'
       or coalesce(r.value->>'representative_line_number','') !~
          '^[1-9][0-9]{0,2}$'
       or jsonb_typeof(coalesce(
            r.value->'source_line_numbers','[]'::jsonb
          )) <> 'array'
  ) then
    raise exception using errcode = '22023',
      message = 'INVENTORY_ITEMS_INVALID';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_requirement_set->'requirements') r(value)
    where (r.value->>'total_required_quantity')::integer > 10000
       or (r.value->>'representative_line_number')::integer > 100
  ) then
    raise exception using errcode = '22023',
      message = 'INVENTORY_QUANTITY_INVALID';
  end if;
  select count(distinct (r.value->>'catalog_item_id')::uuid)
  into v_distinct_requirement_count
  from jsonb_array_elements(p_requirement_set->'requirements') r(value);
  if v_requirement_count <> v_distinct_requirement_count then
    raise exception using errcode = '22023',
      message = 'INVENTORY_ITEMS_INVALID';
  end if;

  /* Resolve cardinality before locking; the canonical unique key should make
     ambiguity impossible, but drift is detected rather than hidden. */
  with requirements as (
    select
      (r.value->>'catalog_item_id')::uuid as catalog_item_id
    from jsonb_array_elements(p_requirement_set->'requirements') r(value)
  ),
  cardinality as (
    select q.catalog_item_id,count(s.id) as stock_count
    from requirements q
    left join public.inventory_stock s
      on s.tenant_id = p_tenant_id
     and s.branch_id = p_branch_id
     and s.catalog_item_id = q.catalog_item_id
    group by q.catalog_item_id
  )
  select catalog_item_id into v_missing
  from cardinality where stock_count = 0
  order by catalog_item_id limit 1;
  if v_missing is not null then
    raise exception using errcode = 'P0002',
      message = 'INVENTORY_STOCK_NOT_FOUND';
  end if;

  with requirements as (
    select
      (r.value->>'catalog_item_id')::uuid as catalog_item_id
    from jsonb_array_elements(p_requirement_set->'requirements') r(value)
  ),
  cardinality as (
    select q.catalog_item_id,count(s.id) as stock_count
    from requirements q
    join public.inventory_stock s
      on s.tenant_id = p_tenant_id
     and s.branch_id = p_branch_id
     and s.catalog_item_id = q.catalog_item_id
    group by q.catalog_item_id
  )
  select catalog_item_id into v_ambiguous
  from cardinality where stock_count > 1
  order by catalog_item_id limit 1;
  if v_ambiguous is not null then
    raise exception using errcode = 'P0001',
      message = 'INVENTORY_STOCK_AMBIGUOUS';
  end if;

  /*
  Lock the complete set in one deterministic total order. This loop performs no
  quantity or version validation and no mutation. All matching row locks are
  acquired before the validation loop below begins.
  */
  for v_locked_row in
    select
      s.id as stock_id,s.tenant_id,s.branch_id,s.catalog_item_id,
      s.quantity_on_hand,s.record_version,
      (r.value->>'total_required_quantity')::integer as required_quantity,
      (r.value->>'representative_line_number')::integer
        as representative_line_number,
      r.value->'source_line_numbers' as source_line_numbers,
      r.value->>'tracking_mode' as tracking_mode
    from jsonb_array_elements(p_requirement_set->'requirements') r(value)
    join public.inventory_stock s
      on s.tenant_id = p_tenant_id
     and s.branch_id = p_branch_id
     and s.catalog_item_id = (r.value->>'catalog_item_id')::uuid
    order by s.catalog_item_id,s.id
    for update of s
  loop
    v_locked_rows := v_locked_rows || jsonb_build_array(jsonb_build_object(
      'stock_id',v_locked_row.stock_id,
      'tenant_id',v_locked_row.tenant_id,
      'branch_id',v_locked_row.branch_id,
      'catalog_item_id',v_locked_row.catalog_item_id,
      'required_quantity',v_locked_row.required_quantity,
      'quantity_before',v_locked_row.quantity_on_hand,
      'quantity_after',
        v_locked_row.quantity_on_hand - v_locked_row.required_quantity,
      'record_version_before',v_locked_row.record_version,
      'record_version_after',v_locked_row.record_version + 1,
      'tracking_mode',v_locked_row.tracking_mode,
      'representative_line_number',
        v_locked_row.representative_line_number,
      'source_line_numbers',v_locked_row.source_line_numbers
    ));
  end loop;
  if jsonb_array_length(v_locked_rows) <> v_requirement_count then
    raise exception using errcode = '40001',
      message = 'INVENTORY_LOCK_CONFLICT';
  end if;

  /* All stock rows are now locked. Only validation occurs in this pass. */
  for v_locked in select value from jsonb_array_elements(v_locked_rows)
  loop
    if (v_locked->>'tenant_id')::uuid <> p_tenant_id
       or (v_locked->>'branch_id')::uuid <> p_branch_id
       or v_locked->>'tracking_mode' <> 'tracked_product' then
      raise exception using errcode = '42501',
        message = 'INVENTORY_SCOPE_INVALID';
    end if;
    if (v_locked->>'required_quantity')::numeric <= 0
       or (v_locked->>'required_quantity')::numeric > 10000
       or (v_locked->>'quantity_before') is null
       or (v_locked->>'quantity_before')::numeric < 0 then
      raise exception using errcode = '22023',
        message = 'INVENTORY_QUANTITY_INVALID';
    end if;
    if (v_locked->>'record_version_before') is null
       or (v_locked->>'record_version_before')::bigint < 1 then
      raise exception using errcode = '22023',
        message = 'INVENTORY_VERSION_INVALID';
    end if;
    if (v_locked->>'quantity_after')::numeric < 0 then
      raise exception using errcode = '23514',
        message = 'INSUFFICIENT_STOCK';
    end if;
    if (v_locked->>'record_version_after')::bigint
       <> (v_locked->>'record_version_before')::bigint + 1 then
      raise exception using errcode = 'P0001',
        message = 'INVENTORY_VERSION_INVALID';
    end if;
  end loop;
  return jsonb_build_object(
    'version','locked-inventory-v1',
    'locked_count',v_requirement_count,
    'rows',v_locked_rows
  );
end;
$function$;

create or replace function public.build_inventory_movement_evidence_v2(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_catalog_item_id uuid,
  p_order_id uuid,
  p_invoice_id uuid,
  p_invoice_item_id uuid,
  p_correlation_id uuid,
  p_quantity_delta numeric,
  p_quantity_before numeric,
  p_quantity_after numeric,
  p_version_before bigint,
  p_version_after bigint
)
returns jsonb
language sql
immutable
security invoker
set search_path = pg_catalog
as $function$
  select jsonb_build_object(
    'version','inventory-movement-evidence-v1',
    'tenant_id',p_tenant_id,
    'branch_id',p_branch_id,
    'catalog_item_id',p_catalog_item_id,
    'order_id',p_order_id,
    'invoice_id',p_invoice_id,
    'invoice_item_id',p_invoice_item_id,
    'correlation_id',p_correlation_id,
    'movement_type','sale',
    'movement_reason','atomic_order_sale',
    'quantity_delta',p_quantity_delta,
    'quantity_before',p_quantity_before,
    'quantity_after',p_quantity_after,
    'stock_version_before',p_version_before,
    'stock_version_after',p_version_after,
    'inventory_engine_version','inventory-engine-v2-r1'
  );
$function$;

create or replace function public.apply_inventory_mutations_v2(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_order_id uuid,
  p_invoice_id uuid,
  p_actor_user_id uuid,
  p_correlation_id uuid,
  p_locked_set jsonb,
  p_invoice_item_map jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_locked jsonb;
  v_invoice_item_id uuid;
  v_invoice_item_count integer;
  v_evidence jsonb;
  v_hash text;
  v_movement_count integer := 0;
  v_update_count integer := 0;
  v_affected integer;
  v_evidence_refs jsonb := '[]'::jsonb;
begin
  if p_tenant_id is null or p_branch_id is null or p_order_id is null
     or p_invoice_id is null or p_actor_user_id is null
     or p_correlation_id is null
     or p_locked_set is null or jsonb_typeof(p_locked_set) <> 'object'
     or p_locked_set->>'version' <> 'locked-inventory-v1'
     or jsonb_typeof(p_locked_set->'rows') <> 'array'
     or coalesce(p_locked_set->>'locked_count','') !~ '^[0-9]{1,3}$'
     or p_invoice_item_map is null
     or jsonb_typeof(p_invoice_item_map) <> 'array' then
    raise exception using errcode = '22023',
      message = 'INVENTORY_MOVEMENT_PERSISTENCE_INVALID';
  end if;
  if jsonb_array_length(p_invoice_item_map)
       <> (p_locked_set->>'locked_count')::integer
     or exists (
       select 1
       from jsonb_array_elements(p_invoice_item_map) m(value)
       where jsonb_typeof(m.value) <> 'object'
          or coalesce(m.value->>'catalog_item_id','') !~
             '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
          or coalesce(m.value->>'invoice_item_id','') !~
             '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     ) then
    raise exception using errcode = '22023',
      message = 'INVENTORY_MOVEMENT_PERSISTENCE_INVALID';
  end if;

  /*
  Phase one inserts exactly one movement for every aggregate. Invoice items are
  already aggregated deterministically, so the one matching item is the exact
  representative linkage. Package 2 has no employee/request-fingerprint/
  inventory-stock-id movement columns; those remain an explicit 4R.4/Package 2
  follow-up rather than being hidden in notes.
  */
  for v_locked in
    select value from jsonb_array_elements(p_locked_set->'rows')
    order by (value->>'catalog_item_id')::uuid,(value->>'stock_id')::uuid
  loop
    select count(*),(array_agg(
      (m.value->>'invoice_item_id')::uuid
      order by (m.value->>'invoice_item_id')::uuid
    ))[1]
    into v_invoice_item_count,v_invoice_item_id
    from jsonb_array_elements(p_invoice_item_map) m(value)
    where (m.value->>'catalog_item_id')::uuid
      = (v_locked->>'catalog_item_id')::uuid;
    if v_invoice_item_count <> 1 or v_invoice_item_id is null then
      raise exception using errcode = 'P0001',
        message = 'INVENTORY_MOVEMENT_PERSISTENCE_INVALID';
    end if;

    v_evidence := public.build_inventory_movement_evidence_v2(
      p_tenant_id,p_branch_id,(v_locked->>'catalog_item_id')::uuid,
      p_order_id,p_invoice_id,v_invoice_item_id,p_correlation_id,
      -(v_locked->>'required_quantity')::numeric,
      (v_locked->>'quantity_before')::numeric,
      (v_locked->>'quantity_after')::numeric,
      (v_locked->>'record_version_before')::bigint,
      (v_locked->>'record_version_after')::bigint
    );
    v_hash := encode(extensions.digest(v_evidence::text,'sha256'),'hex');
    v_evidence_refs := v_evidence_refs || jsonb_build_array(
      jsonb_build_object(
        'catalog_item_id',v_locked->>'catalog_item_id',
        'inventory_snapshot_hash',v_hash,
        'quantity_delta',-(v_locked->>'required_quantity')::numeric,
        'quantity_after',(v_locked->>'quantity_after')::numeric,
        'stock_version_after',(v_locked->>'record_version_after')::bigint
      )
    );

    insert into public.inventory_movements (
      tenant_id,branch_id,catalog_item_id,movement_type,quantity_delta,
      source_type,source_id,notes,created_by,created_at,movement_reason,
      quantity_before,quantity_after,stock_version_before,stock_version_after,
      order_id,invoice_id,invoice_item_id,correlation_id,
      inventory_engine_version,inventory_snapshot_version,
      inventory_snapshot_hash
    )
    values (
      p_tenant_id,p_branch_id,(v_locked->>'catalog_item_id')::uuid,
      'sale',-(v_locked->>'required_quantity')::numeric,
      'invoice_item',v_invoice_item_id,'Core V2 atomic sale',p_actor_user_id,
      transaction_timestamp(),'atomic_order_sale',
      (v_locked->>'quantity_before')::numeric,
      (v_locked->>'quantity_after')::numeric,
      (v_locked->>'record_version_before')::bigint,
      (v_locked->>'record_version_after')::bigint,
      p_order_id,p_invoice_id,v_invoice_item_id,p_correlation_id::text,
      'inventory-engine-v2-r1','inventory-movement-evidence-v1',v_hash
    );
    get diagnostics v_affected = row_count;
    if v_affected <> 1 then
      raise exception using errcode = 'P0001',
        message = 'INVENTORY_MOVEMENT_PERSISTENCE_INVALID';
    end if;
    v_movement_count := v_movement_count + 1;
  end loop;

  /* Phase two mutates each previously locked aggregate exactly once. */
  for v_locked in
    select value from jsonb_array_elements(p_locked_set->'rows')
    order by (value->>'catalog_item_id')::uuid,(value->>'stock_id')::uuid
  loop
    update public.inventory_stock s
    set quantity_on_hand = (v_locked->>'quantity_after')::numeric,
        record_version = (v_locked->>'record_version_after')::bigint,
        updated_at = transaction_timestamp()
    where s.id = (v_locked->>'stock_id')::uuid
      and s.tenant_id = p_tenant_id
      and s.branch_id = p_branch_id
      and s.catalog_item_id = (v_locked->>'catalog_item_id')::uuid
      and s.quantity_on_hand = (v_locked->>'quantity_before')::numeric
      and s.record_version = (v_locked->>'record_version_before')::bigint;
    get diagnostics v_affected = row_count;
    if v_affected <> 1 then
      raise exception using errcode = '40001',
        message = 'INVENTORY_MUTATION_CONFLICT';
    end if;
    v_update_count := v_update_count + 1;
  end loop;

  if v_movement_count <> (p_locked_set->>'locked_count')::integer
     or v_update_count <> (p_locked_set->>'locked_count')::integer then
    raise exception using errcode = 'P0001',
      message = 'INVENTORY_MUTATION_CONFLICT';
  end if;
  return jsonb_build_object(
    'inventory_engine_version','inventory-engine-v2-r1',
    'tracked_items_mutated',v_update_count,
    'movements_inserted',v_movement_count,
    'evidence_refs',v_evidence_refs
  );
end;
$function$;

create or replace function public.atomic_semantic_event_uuid_v1(
  p_identity text
)
returns uuid
language sql
immutable
strict
security invoker
set search_path = pg_catalog
as $function$
  select (
    substr(v.hash,1,8)||'-'||substr(v.hash,9,4)||'-5'||substr(v.hash,14,3)||
    '-a'||substr(v.hash,18,3)||'-'||substr(v.hash,21,12)
  )::uuid
  from (
    select encode(extensions.digest(p_identity,'sha256'),'hex') as hash
  ) v;
$function$;

create or replace function public.enqueue_atomic_outbox_v2(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_order_id uuid,
  p_invoice_id uuid,
  p_customer_id uuid,
  p_customer_was_created boolean,
  p_shared_number text,
  p_currency_code text,
  p_total numeric,
  p_payment_method text,
  p_payment_status text,
  p_financial_snapshot_hash text,
  p_inventory_result jsonb,
  p_correlation_id uuid,
  p_created_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_count integer := 0;
  v_expected integer := 1;
  v_payload jsonb;
  v_payload_hash text;
  v_event_id uuid;
  v_affected integer;
  v_event_hashes jsonb := '[]'::jsonb;
  v_constraint_name text;
begin
  if p_tenant_id is null or p_branch_id is null or p_order_id is null
     or p_invoice_id is null or p_customer_id is null
     or p_customer_was_created is null
     or nullif(btrim(p_shared_number),'') is null
     or coalesce(p_currency_code,'') !~ '^[A-Z]{3}$'
     or p_total is null or p_total < 0
     or nullif(btrim(p_payment_method),'') is null
     or nullif(btrim(p_payment_status),'') is null
     or coalesce(p_financial_snapshot_hash,'') !~ '^[0-9a-f]{64}$'
     or p_inventory_result is null
     or jsonb_typeof(p_inventory_result) <> 'object'
     or coalesce(p_inventory_result->>'tracked_items_mutated','') !~ '^[0-9]{1,3}$'
     or jsonb_typeof(p_inventory_result->'evidence_refs') <> 'array'
     or p_correlation_id is null or p_created_at is null then
    raise exception using errcode = '22023', message = 'OUTBOX_EVENT_INVALID';
  end if;

  /* Invoice creation is the canonical Release 1 financial event. */
  v_payload := jsonb_build_object(
    'payload_version','invoice-created-v1',
    'correlation_id',p_correlation_id,
    'aggregate_type','invoice',
    'aggregate_id',p_invoice_id,
    'invoice_id',p_invoice_id,
    'order_id',p_order_id,
    'customer_id',p_customer_id,
    'number',p_shared_number,
    'currency_code',p_currency_code,
    'total',p_total,
    'payment_method',p_payment_method,
    'payment_status',p_payment_status,
    'financial_snapshot_hash',p_financial_snapshot_hash
  );
  v_payload_hash := encode(extensions.digest(v_payload::text,'sha256'),'hex');
  v_event_id := public.atomic_semantic_event_uuid_v1(
    p_tenant_id::text||':invoice_created:invoice:'||
    p_invoice_id::text||':invoice-created-v1'
  );
  begin
    insert into public.atomic_outbox (
      id,event_id, correlation_id, aggregate_id, aggregate_type,
      tenant_id, branch_id, event_type, payload_version, payload,
      payload_hash, lease_owner, attempt_count, retry_count,
      execution_status, next_attempt_at, lease_expires_at,
      created_at, updated_at
    )
    values (
      v_event_id,v_event_id,p_correlation_id::text,p_invoice_id,'invoice',
      p_tenant_id,p_branch_id,'invoice_created','invoice-created-v1',v_payload,
      v_payload_hash,null,0,0,'pending_commit',p_created_at,null,
      p_created_at,p_created_at
    );
  exception when unique_violation then
    get stacked diagnostics v_constraint_name = constraint_name;
    if v_constraint_name = any(array['atomic_outbox_pkey','uq_atomic_outbox_event_id'])
    then
      raise exception using errcode = '23505',
        message = 'OUTBOX_DEDUPLICATION_CONFLICT';
    end if;
    raise;
  end;
  get diagnostics v_affected = row_count;
  if v_affected <> 1 then
    raise exception using errcode = 'P0001',
      message = 'OUTBOX_PERSISTENCE_INVALID';
  end if;
  v_count := v_count + 1;
  v_event_hashes := v_event_hashes || jsonb_build_array(v_payload_hash);

  if p_customer_was_created then
    v_expected := v_expected + 1;
    v_payload := jsonb_build_object(
      'payload_version','customer-created-v1',
      'correlation_id',p_correlation_id,
      'aggregate_type','customer',
      'aggregate_id',p_customer_id,
      'customer_id',p_customer_id
    );
    v_payload_hash := encode(extensions.digest(v_payload::text,'sha256'),'hex');
    v_event_id := public.atomic_semantic_event_uuid_v1(
      p_tenant_id::text||':customer_created:customer:'||
      p_customer_id::text||':customer-created-v1'
    );
    begin
      insert into public.atomic_outbox (
        id,event_id,correlation_id,aggregate_id,aggregate_type,tenant_id,
        branch_id,event_type,payload_version,payload,payload_hash,lease_owner,
        attempt_count,retry_count,execution_status,next_attempt_at,
        lease_expires_at,created_at,updated_at
      ) values (
        v_event_id,v_event_id,p_correlation_id::text,p_customer_id,'customer',
        p_tenant_id,p_branch_id,'customer_created','customer-created-v1',
        v_payload,v_payload_hash,null,0,0,'pending_commit',p_created_at,null,
        p_created_at,p_created_at
      );
    exception when unique_violation then
      get stacked diagnostics v_constraint_name = constraint_name;
      if v_constraint_name = any(array['atomic_outbox_pkey','uq_atomic_outbox_event_id'])
      then
        raise exception using errcode = '23505',
          message = 'OUTBOX_DEDUPLICATION_CONFLICT';
      end if;
      raise;
    end;
    get diagnostics v_affected = row_count;
    if v_affected <> 1 then
      raise exception using errcode = 'P0001',
        message = 'OUTBOX_PERSISTENCE_INVALID';
    end if;
    v_count := v_count + 1;
    v_event_hashes := v_event_hashes || jsonb_build_array(v_payload_hash);
  end if;

  if (p_inventory_result->>'tracked_items_mutated')::integer > 0 then
    v_expected := v_expected + 1;
    v_payload := jsonb_build_object(
      'payload_version','inventory-changed-v1',
      'correlation_id',p_correlation_id,
      'aggregate_type','inventory',
      'aggregate_id',p_order_id,
      'order_id',p_order_id,
      'invoice_id',p_invoice_id,
      'number',p_shared_number,
      'inventory_engine_version',p_inventory_result->>'inventory_engine_version',
      'tracked_items_mutated',
        (p_inventory_result->>'tracked_items_mutated')::integer,
      'evidence_refs',p_inventory_result->'evidence_refs'
    );
    v_payload_hash := encode(extensions.digest(v_payload::text,'sha256'),'hex');
    v_event_id := public.atomic_semantic_event_uuid_v1(
      p_tenant_id::text||':inventory_changed:inventory:'||
      p_order_id::text||':inventory-changed-v1'
    );
    begin
      insert into public.atomic_outbox (
        id,event_id,correlation_id,aggregate_id,aggregate_type,tenant_id,
        branch_id,event_type,payload_version,payload,payload_hash,lease_owner,
        attempt_count,retry_count,execution_status,next_attempt_at,
        lease_expires_at,created_at,updated_at
      ) values (
        v_event_id,v_event_id,p_correlation_id::text,p_order_id,'inventory',
        p_tenant_id,p_branch_id,'inventory_changed','inventory-changed-v1',
        v_payload,v_payload_hash,null,0,0,'pending_commit',p_created_at,null,
        p_created_at,p_created_at
      );
    exception when unique_violation then
      get stacked diagnostics v_constraint_name = constraint_name;
      if v_constraint_name = any(array['atomic_outbox_pkey','uq_atomic_outbox_event_id'])
      then
        raise exception using errcode = '23505',
          message = 'OUTBOX_DEDUPLICATION_CONFLICT';
      end if;
      raise;
    end;
    get diagnostics v_affected = row_count;
    if v_affected <> 1 then
      raise exception using errcode = 'P0001',
        message = 'OUTBOX_PERSISTENCE_INVALID';
    end if;
    v_count := v_count + 1;
    v_event_hashes := v_event_hashes || jsonb_build_array(v_payload_hash);
  end if;

  if v_count <> v_expected then
    raise exception using errcode = 'P0001',
      message = 'OUTBOX_PERSISTENCE_INVALID';
  end if;
  return jsonb_build_object(
    'events_inserted',v_count,
    'payload_hashes',v_event_hashes
  );
exception
  when check_violation then
    get stacked diagnostics v_constraint_name = constraint_name;
    if v_constraint_name = any(array[
      'ck_atomic_outbox_event_type','ck_atomic_outbox_aggregate_type',
      'ck_atomic_outbox_execution_status','ck_atomic_outbox_payload_object',
      'ck_atomic_outbox_payload_hash','ck_atomic_outbox_counts',
      'ck_atomic_outbox_correlation_id','ck_atomic_outbox_payload_version',
      'ck_atomic_outbox_bounded_text','ck_atomic_outbox_processing_lease',
      'ck_atomic_outbox_nonprocessing_lease',
      'ck_atomic_outbox_delivered_at','ck_atomic_outbox_terminal_lease',
      'ck_atomic_outbox_next_attempt'
    ]) then
      raise exception using errcode = 'P0001',
        message = 'OUTBOX_PERSISTENCE_INVALID';
    end if;
    raise;
end;
$function$;

/*
Financial authority boundary.

The caller supplies intent only: catalog identities, quantities, an optional
discount identity, a payment method, and (for cash only) tendered cash.
Catalog, branch pricing, VAT, discount, cost, totals, payment state, profit,
versions, and the committed snapshot hash are derived here from locked,
tenant-scoped database state. A financial quote remains advisory evidence; it
is never the committed financial truth.
*/
create or replace function public.derive_atomic_financial_snapshot_v2(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_financial_intent jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_unknown_key text;
  v_raw_item jsonb;
  v_line record;
  v_catalog public.catalog_items%rowtype;
  v_branch_price public.branch_catalog_items%rowtype;
  v_discount public.discounts%rowtype;
  v_vat public.vat_settings%rowtype;
  v_items_base jsonb := '[]'::jsonb;
  v_items_final jsonb := '[]'::jsonb;
  v_item jsonb;
  v_snapshot jsonb;
  v_snapshot_hash text;
  v_discount_id uuid;
  v_payment_method text;
  v_cash_settlement_state text;
  v_cash_received numeric(18,2);
  v_unit_price numeric(18,2);
  v_quantity integer;
  v_gross numeric(18,2);
  v_cost numeric(18,2);
  v_subtotal numeric(18,2) := 0;
  v_discount_amount numeric(18,2) := 0;
  v_discount_allocated numeric(18,2) := 0;
  v_line_discount numeric(18,2);
  v_taxable numeric(18,2);
  v_taxable_subtotal numeric(18,2) := 0;
  v_vat_amount numeric(18,2);
  v_total numeric(18,2);
  v_remaining numeric(18,2) := 0;
  v_change numeric(18,2) := 0;
  v_payment_status text;
  v_vat_rule_version text;
  v_discount_rule_version text := 'discount-none-v1';
  v_override_count integer;
  v_vat_count integer;
  v_line_count integer;
  v_line_number integer := 0;
begin
  if p_tenant_id is null or p_branch_id is null
     or p_financial_intent is null
     or jsonb_typeof(p_financial_intent) <> 'object' then
    raise exception using errcode = '22023',
      message = 'FINANCIAL_INTENT_INVALID';
  end if;

  select k.key into v_unknown_key
  from jsonb_object_keys(p_financial_intent) as k(key)
  where k.key <> all(array[
    'items','discount_id','payment_method','cash_received'
  ])
  limit 1;
  if v_unknown_key is not null then
    raise exception using errcode = '22023',
      message = 'FINANCIAL_INTENT_UNKNOWN_KEYS';
  end if;
  if p_financial_intent->'items' is null
     or jsonb_typeof(p_financial_intent->'items') <> 'array'
     or jsonb_array_length(p_financial_intent->'items') = 0 then
    raise exception using errcode = '22023', message = 'EMPTY_CART';
  end if;
  if jsonb_array_length(p_financial_intent->'items') > 100 then
    raise exception using errcode = '22023', message = 'CART_LIMIT_EXCEEDED';
  end if;

  /* Validate every element before any text-to-type cast. */
  for v_raw_item in
    select value
    from jsonb_array_elements(p_financial_intent->'items')
  loop
    if jsonb_typeof(v_raw_item) <> 'object' then
      raise exception using errcode = '22023', message = 'ITEM_INTENT_INVALID';
    end if;
    select k.key into v_unknown_key
    from jsonb_object_keys(v_raw_item) as k(key)
    where k.key <> all(array['catalog_item_id','quantity'])
    limit 1;
    if v_unknown_key is not null
       or coalesce(v_raw_item->>'catalog_item_id','') !~
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
       or coalesce(v_raw_item->>'quantity','') !~ '^[1-9][0-9]{0,4}$' then
      raise exception using errcode = '22023', message = 'ITEM_INTENT_INVALID';
    end if;
    if (v_raw_item->>'quantity')::numeric > 10000 then
      raise exception using errcode = '22023', message = 'ITEM_INTENT_INVALID';
    end if;
  end loop;

  /*
  Aggregate repeated catalog identities first. This prevents duplicate add
  lines from changing rounding or lock order. UUID ordering is deterministic.
  */
  for v_line in
    select
      (j.value->>'catalog_item_id')::uuid as catalog_item_id,
      sum((j.value->>'quantity')::integer)::bigint as quantity,
      array_agg(j.source_line::integer order by j.source_line) as source_lines
    from jsonb_array_elements(p_financial_intent->'items')
      with ordinality j(value,source_line)
    group by (j.value->>'catalog_item_id')::uuid
    order by (j.value->>'catalog_item_id')::uuid
  loop
    if v_line.quantity > 10000 then
      raise exception using errcode = '22023', message = 'INVALID_QUANTITY';
    end if;
    v_quantity := v_line.quantity::integer;

    select * into v_catalog
    from public.catalog_items c
    where c.id = v_line.catalog_item_id
    for share;
    if not found then
      raise exception using errcode = 'P0002', message = 'PRICE_NOT_FOUND';
    end if;
    if v_catalog.tenant_id is distinct from p_tenant_id then
      raise exception using errcode = '42501', message = 'PRICE_SCOPE_INVALID';
    end if;
    if v_catalog.is_active is not true
       or v_catalog.deleted_at is not null then
      raise exception using errcode = '22023', message = 'PRICE_INVALID';
    end if;
    if v_catalog.item_type <> all(array['product','service']) then
      raise exception using errcode = '22023',
        message = 'FINANCIAL_CONFIGURATION_INVALID';
    end if;

    if exists (
      select 1
      from public.branch_catalog_items b
      where b.branch_id = p_branch_id
        and b.catalog_item_id = v_catalog.id
        and b.is_active
        and b.tenant_id is distinct from p_tenant_id
    ) then
      raise exception using errcode = '42501',
        message = 'PRICE_SCOPE_INVALID';
    end if;
    select count(*)::integer into v_override_count
    from public.branch_catalog_items b
    where b.tenant_id = p_tenant_id
      and b.branch_id = p_branch_id
      and b.catalog_item_id = v_catalog.id
      and b.is_active;
    if v_override_count > 1 then
      raise exception using errcode = 'P0001',
        message = 'PRICE_INVALID';
    end if;
    if v_override_count = 1 then
      select * into strict v_branch_price
      from public.branch_catalog_items b
      where b.tenant_id = p_tenant_id
        and b.branch_id = p_branch_id
        and b.catalog_item_id = v_catalog.id
        and b.is_active
      for share;
      v_unit_price := round(v_branch_price.price::numeric, 2);
    else
      v_branch_price.id := null;
      v_branch_price.updated_at := null;
      v_unit_price := round(v_catalog.default_price::numeric, 2);
    end if;
    if v_unit_price is null or v_unit_price < 0
       or v_unit_price > 99999999.99 then
      raise exception using errcode = 'P0001', message = 'PRICE_INVALID';
    end if;
    if v_catalog.cost_price is null or v_catalog.cost_price < 0 then
      raise exception using errcode = 'P0001',
        message = 'FINANCIAL_SNAPSHOT_INVALID';
    end if;

    v_gross := round(v_unit_price * v_quantity, 2);
    v_cost := round(v_catalog.cost_price::numeric * v_quantity, 2);
    if v_gross > 99999999.99 or v_cost > 9999999999999999.99 then
      raise exception using errcode = '22003', message = 'PRICE_INVALID';
    end if;
    v_subtotal := v_subtotal + v_gross;
    if v_subtotal > 99999999.99 then
      raise exception using errcode = '22003', message = 'PRICE_INVALID';
    end if;
    v_items_base := v_items_base || jsonb_build_array(jsonb_build_object(
      'catalog_item_id', v_catalog.id,
      'name', v_catalog.name,
      'item_type', v_catalog.item_type,
      'category', v_catalog.category,
      'quantity', v_quantity,
      'source_line_numbers', to_jsonb(v_line.source_lines),
      'unit_price', v_unit_price,
      'gross_amount', v_gross,
      'line_total', v_gross,
      'cost_snapshot', v_cost,
      'cost_price', round(v_catalog.cost_price::numeric, 2),
      'price_source', case when v_override_count = 1
        then 'branch_override' else 'catalog' end,
      'source_branch_price_id', case when v_override_count = 1
        then v_branch_price.id else null end,
      'source_catalog_updated_at', v_catalog.updated_at,
      'source_branch_price_updated_at', case when v_override_count = 1
        then v_branch_price.updated_at else null end,
      'inventory_tracking_mode', case
        when v_catalog.item_type = 'service' then 'service'
        when v_catalog.track_inventory then 'tracked_product'
        else 'untracked_product' end,
      'track_inventory', coalesce(v_catalog.track_inventory,false)
    ));
  end loop;
  v_subtotal := round(v_subtotal, 2);

  if nullif(p_financial_intent->>'discount_id','') is not null then
    if (p_financial_intent->>'discount_id') !~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
      raise exception using errcode = '22023', message = 'DISCOUNT_INVALID';
    end if;
    v_discount_id := (p_financial_intent->>'discount_id')::uuid;
    select * into v_discount
    from public.discounts d
    where d.id = v_discount_id
    for share;
    if not found
       or v_discount.tenant_id is distinct from p_tenant_id
       or v_discount.deleted_at is not null
       or v_discount.is_active is not true
       or (v_discount.branch_id is not null
           and v_discount.branch_id <> p_branch_id) then
      raise exception using errcode = '22023', message = 'DISCOUNT_INVALID';
    end if;
    if v_discount.type = 'percentage'
       and v_discount.value between 0 and 100 then
      v_discount_amount := round(v_subtotal * v_discount.value / 100, 2);
    elsif v_discount.type = 'fixed'
          and v_discount.value between 0 and v_subtotal then
      v_discount_amount := round(v_discount.value, 2);
    else
      raise exception using errcode = '22023',
        message = 'DISCOUNT_INVALID';
    end if;
    v_discount_rule_version := concat(
      'discount-v1:',v_discount.id::text,':',
      coalesce(extract(epoch from v_discount.updated_at)::text,'no-updated-at')
    );
  end if;

  /* Branch-specific VAT wins; otherwise exactly one tenant-global row. */
  select count(*)::integer into v_vat_count
  from public.vat_settings s
  where s.tenant_id = p_tenant_id and s.branch_id = p_branch_id
    and s.is_active;
  if v_vat_count > 1 then
    raise exception using errcode = 'P0001',
      message = 'VAT_INVALID';
  elsif v_vat_count = 1 then
    select * into strict v_vat
    from public.vat_settings s
    where s.tenant_id = p_tenant_id and s.branch_id = p_branch_id
      and s.is_active
    for share;
  else
    select count(*)::integer into v_vat_count
    from public.vat_settings s
    where s.tenant_id = p_tenant_id and s.branch_id is null
      and s.is_active;
    if v_vat_count > 1 then
      raise exception using errcode = 'P0001',
        message = 'VAT_INVALID';
    elsif v_vat_count = 0 then
      raise exception using errcode = 'P0002',
        message = 'VAT_INVALID';
    end if;
    select * into strict v_vat
    from public.vat_settings s
    where s.tenant_id = p_tenant_id and s.branch_id is null
      and s.is_active
    for share;
  end if;
  if v_vat.rate < 0 or v_vat.rate > 100 then
    raise exception using errcode = 'P0001',
      message = 'VAT_INVALID';
  end if;
  v_vat_rule_version := concat(
    'vat-v1:',v_vat.id::text,':',
    coalesce(extract(epoch from v_vat.updated_at)::text,'no-updated-at')
  );

  /*
  Header discount is allocated proportionally in deterministic item order.
  The last line receives the residual so line allocations equal the header
  amount exactly. All financial rounding is half-away-from-zero at 2 decimals,
  PostgreSQL numeric round() semantics.
  */
  v_line_count := jsonb_array_length(v_items_base);
  for v_item in select value from jsonb_array_elements(v_items_base)
  loop
    v_line_number := v_line_number + 1;
    v_gross := (v_item->>'gross_amount')::numeric;
    if v_line_number = v_line_count then
      v_line_discount := v_discount_amount - v_discount_allocated;
    elsif v_subtotal = 0 then
      v_line_discount := 0;
    else
      v_line_discount := round(v_discount_amount * v_gross / v_subtotal, 2);
    end if;
    v_line_discount := greatest(0, least(v_gross, v_line_discount));
    v_discount_allocated := v_discount_allocated + v_line_discount;
    v_taxable := round(v_gross - v_line_discount, 2);
    v_taxable_subtotal := v_taxable_subtotal + v_taxable;
    v_cost := (v_item->>'cost_snapshot')::numeric;
    v_items_final := v_items_final || jsonb_build_array(
      (v_item - 'line_total') || jsonb_build_object(
        'line_number', v_line_number,
        'discount_allocation', v_line_discount,
        'taxable_amount', v_taxable,
        'line_total', v_taxable,
        'profit_snapshot', round(v_taxable - v_cost, 2),
        'cost_snapshot_status', 'complete',
        'cost_snapshot_version', 'catalog-cost-v1',
        'pricing_snapshot', jsonb_build_object(
          'version','pricing-snapshot-v1',
          'price_source',v_item->>'price_source',
          'unit_price',(v_item->>'unit_price')::numeric,
          'source_catalog_updated_at',v_item->>'source_catalog_updated_at',
          'source_branch_price_id',v_item->>'source_branch_price_id',
          'source_branch_price_updated_at',
            v_item->>'source_branch_price_updated_at'
        )
      )
    );
  end loop;
  v_taxable_subtotal := round(v_taxable_subtotal, 2);
  v_vat_amount := round(v_taxable_subtotal * v_vat.rate / 100, 2);
  v_total := round(v_taxable_subtotal + v_vat_amount, 2);
  if v_discount_amount > 99999999.99
     or v_taxable_subtotal > 99999999.99
     or v_vat_amount > 99999999.99
     or v_total > 99999999.99 then
    raise exception using errcode = '22003',
      message = 'FINANCIAL_SNAPSHOT_INVALID';
  end if;

  v_payment_method := lower(nullif(btrim(p_financial_intent->>'payment_method'),''));
  if v_payment_method = 'cod' then v_payment_method := 'on_delivery'; end if;
  if v_payment_method <> all(array[
    'cash','card','mada','visa','transfer','on_delivery'
  ]) then
    raise exception using errcode = '22023',
      message = 'PAYMENT_METHOD_INVALID';
  end if;
  if nullif(p_financial_intent->>'cash_received','') is not null then
    if (p_financial_intent->>'cash_received') !~
       '^[0-9]{1,16}([.][0-9]{1,2})?$' then
      raise exception using errcode = '22023', message = 'PAYMENT_STATE_INVALID';
    end if;
    v_cash_received := round((p_financial_intent->>'cash_received')::numeric,2);
  else
    v_cash_received := 0;
  end if;
  if v_payment_method = 'cash' then
    v_remaining := greatest(round(v_total - v_cash_received,2),0);
    v_change := greatest(round(v_cash_received - v_total,2),0);
    v_payment_status := case when v_remaining = 0 then 'paid' else 'pending' end;
    v_cash_settlement_state := case
      when v_remaining > 0 then 'UNDERPAYMENT'
      when v_change > 0 then 'OVERPAYMENT'
      else 'EXACT_PAYMENT'
    end;
  elsif v_cash_received <> 0 then
    raise exception using errcode = '22023', message = 'PAYMENT_STATE_INVALID';
  elsif v_payment_method = any(array['card','mada','visa']) then
    v_payment_status := 'paid';
    v_cash_settlement_state := 'NOT_APPLICABLE';
  else
    v_payment_status := 'pending';
    v_remaining := v_total;
    v_cash_settlement_state := 'NOT_APPLICABLE';
  end if;
  if v_remaining > 0 and v_change > 0 then
      raise exception using errcode = 'P0001',
      message = 'PAYMENT_STATE_INVALID';
  end if;

  v_snapshot := jsonb_build_object(
    'currency_code','SAR',
    'subtotal',v_subtotal,
    'discount_id_snapshot',v_discount_id,
    'discount_name_snapshot',case when v_discount_id is null
      then null else v_discount.name end,
    'discount_type_snapshot',case when v_discount_id is null
      then null else v_discount.type end,
    'discount_value_snapshot',case when v_discount_id is null
      then null else v_discount.value end,
    'discount_amount',v_discount_amount,
    'discount',v_discount_amount,
    'taxable_subtotal',v_taxable_subtotal,
    'vat_setting_id_snapshot',v_vat.id,
    'vat_rate_snapshot',v_vat.rate,
    'vat_amount',v_vat_amount,
    'tax',v_vat_amount,
    'total',v_total,
    'payment_method',v_payment_method,
    'payment_status',v_payment_status,
    'cash_received',v_cash_received,
    'remaining_from_customer',v_remaining,
    'cash_change',v_change,
    'payment_snapshot',jsonb_build_object(
      'version','payment-snapshot-v1',
      'method',v_payment_method,
      'status',v_payment_status,
      'cash_received',v_cash_received,
      'remaining_from_customer',v_remaining,
      'cash_change',v_change,
      'cash_settlement_state',v_cash_settlement_state,
      'total',v_total,
      'currency_code','SAR'
    ),
    'pricing_rule_version','branch-override-catalog-fallback-v1',
    'vat_rule_version',v_vat_rule_version,
    'discount_rule_version',v_discount_rule_version,
    'rounding_version','numeric-round-half-away-2dp-v1',
    'payment_rule_version','payment-invariants-v1',
    'financial_engine_version','financial-engine-v2-r1',
    'financial_snapshot_version','financial-snapshot-v1',
    'financial_record_classification','authoritative_committed_snapshot',
    'financial_snapshot_complete',true,
    'financial_completeness_reasons','[]'::jsonb,
    'items',v_items_final
  );
  v_snapshot_hash := encode(
    extensions.digest(v_snapshot::text,'sha256'),'hex'
  );
  return jsonb_build_object(
    'snapshot',v_snapshot,
    'snapshot_hash',v_snapshot_hash
  );
end;
$function$;

create or replace function public.create_order_atomic_v2(
  p_authorization jsonb,
  p_command jsonb,
  p_financial_snapshot jsonb,
  p_outbox_events jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_auth record;
  v_unknown_key text;
  v_context_token text;
  v_idempotency_key_hash text;
  v_user_id uuid;
  v_tenant_id uuid;
  v_branch_id uuid;
  v_employee_id uuid;
  v_correlation_id uuid;
  v_lease_owner uuid;
  v_idem public.idempotency_commands%rowtype;
  v_committed_idem public.idempotency_commands%rowtype;
  v_quote public.financial_quotes%rowtype;
  v_customer public.customers%rowtype;
  v_customer_result jsonb;
  v_financial_result jsonb;
  v_financial jsonb;
  v_financial_hash text;
  v_quoted_financial jsonb;
  v_quoted_financial_hash text;
  v_request_fingerprint text;
  v_customer_id uuid;
  v_order_id uuid := pg_catalog.gen_random_uuid();
  v_invoice_id uuid := pg_catalog.gen_random_uuid();
  v_order_number text;
  v_invoice_number text;
  v_transaction_at timestamptz := transaction_timestamp();
  v_period date;
  v_inventory_requirements jsonb;
  v_locked_inventory jsonb;
  v_inventory_result jsonb;
  v_invoice_item_id uuid;
  v_invoice_item_map jsonb := '[]'::jsonb;
  v_item jsonb;
  v_item_count integer := 0;
  v_expected_item_count integer;
  v_order_count integer := 0;
  v_invoice_count integer := 0;
  v_audit_count integer := 0;
  v_outbox_result jsonb;
  v_expected_outbox_count integer;
  v_customer_was_created boolean := false;
  v_result jsonb;
  v_result_hash text;
  v_updated_count integer;
begin
  /* 4S strict security envelope plus 4R.1 command/resource bounds. */
  if p_authorization is null
     or jsonb_typeof(p_authorization) <> 'object' then
    raise exception using errcode='22023',message='AUTH_CONTEXT_REQUIRED';
  end if;
  select k.key into v_unknown_key
  from jsonb_object_keys(p_authorization) as k(key)
  where k.key<>'authorization_context_token'
  limit 1;
  if v_unknown_key is not null then
    raise exception using errcode='22023',
      message='AUTH_CONTEXT_UNKNOWN_KEYS';
  end if;
  if jsonb_object_length(p_authorization)<>1
     or not (p_authorization ? 'authorization_context_token')
     or jsonb_typeof(p_authorization->'authorization_context_token')<>'string'
  then
    raise exception using errcode='22023',message='AUTH_CONTEXT_INVALID';
  end if;
  v_context_token:=p_authorization->>'authorization_context_token';
  if v_context_token is null
     or v_context_token !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='22023',message='CONTEXT_TOKEN_INVALID';
  end if;

  if p_command is null or jsonb_typeof(p_command) <> 'object'
     or p_financial_snapshot is null
     or jsonb_typeof(p_financial_snapshot) <> 'object'
     or p_outbox_events is null
     or jsonb_typeof(p_outbox_events) <> 'array' then
    raise exception using errcode = '22023', message = 'COMMAND_INVALID';
  end if;
  if jsonb_array_length(p_outbox_events) <> 0 then
    raise exception using errcode = '22023', message = 'OUTBOX_EVENT_INVALID';
  end if;

  select k.key into v_unknown_key
  from jsonb_object_keys(p_command) as k(key)
  where k.key <> all(array[
    'command_type','branch_id',
    'idempotency_key_hash','request_fingerprint',
    'quote_id','quote_fingerprint','quote_hash','customer','note'
  ])
  limit 1;
  if v_unknown_key is not null then
    raise exception using errcode = '22023', message = 'COMMAND_UNKNOWN_KEYS';
  end if;

  if octet_length(p_command::text) > 1048576
     or octet_length(p_financial_snapshot::text) > 2097152
     or octet_length(p_outbox_events::text) > 262144
     or octet_length(p_authorization::text) > 1024
     or octet_length(p_command::text)
        + octet_length(p_financial_snapshot::text)
        + octet_length(p_outbox_events::text)
        + octet_length(p_authorization::text)
        > 3145728
     or octet_length(coalesce(p_command->'customer','{}'::jsonb)::text) > 65536
     or octet_length(p_financial_snapshot::text) > 2097152 then
    raise exception using errcode = '22023', message = 'COMMAND_TOO_LARGE';
  end if;

  if p_command->>'command_type' <> 'create_order' then
    raise exception using errcode = '22023', message = 'COMMAND_INVALID';
  end if;
  if coalesce(p_command->>'idempotency_key_hash','') !~
     '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'IDEMPOTENCY_KEY_INVALID';
  end if;
  v_idempotency_key_hash:=p_command->>'idempotency_key_hash';
  if coalesce(p_command->>'branch_id','') !~
     '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
    raise exception using errcode='22023',message='COMMAND_INVALID';
  end if;
  if coalesce(p_command->>'request_fingerprint','') !~
     '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'REQUEST_FINGERPRINT_INVALID';
  end if;
  if coalesce(p_command->>'quote_id','') !~
     '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
    raise exception using errcode = '22023', message = 'COMMAND_INVALID';
  end if;
  if coalesce(p_command->>'quote_fingerprint','') !~ '^[0-9a-f]{64}$'
     or coalesce(p_command->>'quote_hash','') !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'QUOTE_INVALID';
  end if;
  if p_financial_snapshot->'items' is null
     or jsonb_typeof(p_financial_snapshot->'items') <> 'array' then
    raise exception using errcode = '22023', message = 'COMMAND_INVALID';
  end if;
  if jsonb_array_length(p_financial_snapshot->'items') = 0
     or jsonb_array_length(p_financial_snapshot->'items') > 100
     or octet_length((p_financial_snapshot->'items')::text) > 1048576
     or jsonb_array_length(p_outbox_events) > 20 then
    raise exception using errcode = '22023', message = 'COMMAND_TOO_LARGE';
  end if;
  if p_command->'customer' is null
     or jsonb_typeof(p_command->'customer') <> 'object' then
    raise exception using errcode = '22023', message = 'COMMAND_INVALID';
  end if;

  v_request_fingerprint := public.build_atomic_request_fingerprint_v2(
    p_command,p_financial_snapshot
  );
  if coalesce(v_request_fingerprint,'') !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'P0001',
      message = 'REQUEST_FINGERPRINT_INVALID';
  end if;
  if v_request_fingerprint<>p_command->>'request_fingerprint' then
    raise exception using errcode='22023',
      message='REQUEST_FINGERPRINT_INVALID';
  end if;

  /*
  PostgreSQL owns the one committed correlation ID. The context is consumed
  before idempotency acquisition, so a committed replay requires a newly issued
  context bound to the same key hash. Consumption and every later stage share
  this transaction: any failure rolls consumption back.
  */
  v_correlation_id:=pg_catalog.gen_random_uuid();
  select * into strict v_auth
  from public.consume_atomic_authorization_context_v1(
    v_context_token,v_idempotency_key_hash,v_correlation_id
  );
  if v_auth.correlation_id is distinct from v_correlation_id then
    raise exception using errcode='P0001',
      message='CONTEXT_BINDING_INVALID';
  end if;
  v_user_id := v_auth.actor_user_id;
  v_tenant_id := v_auth.tenant_id;
  v_branch_id := v_auth.branch_id;
  v_employee_id := v_auth.employee_id;
  if (p_command->>'branch_id')::uuid is distinct from v_branch_id then
    raise exception using errcode='42501',
      message='CONTEXT_BINDING_INVALID';
  end if;

  v_idem := public.acquire_idempotency_command_v2(
    v_tenant_id, v_branch_id, 'create_order',
    v_idempotency_key_hash,
    v_request_fingerprint,
    v_user_id, v_employee_id, 'atomic-order-v2-r1', v_correlation_id
  );
  if v_idem.state = 'committed' then
    if v_idem.order_id is null or v_idem.invoice_id is null
       or v_idem.response_version <> 'atomic-order-response-v1'
       or v_idem.response_hash !~ '^[0-9a-f]{64}$' then
      raise exception using errcode = 'P0001',
        message = 'IDEMPOTENCY_REPLAY_INVALID';
    end if;
    v_result := public.build_atomic_order_response_v1(
      v_idem.order_id,v_idem.invoice_id
    );
    v_result_hash := encode(
      extensions.digest(v_result::text,'sha256'),'hex'
    );
    if v_result_hash <> v_idem.response_hash then
      raise exception using errcode = 'P0001',
        message = 'IDEMPOTENCY_REPLAY_INVALID';
    end if;
    return v_result;
  end if;
  if coalesce(v_idem.lease_owner,'') !~
     '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
    raise exception using errcode = '40001',
      message = 'IDEMPOTENCY_LEASE_CONFLICT';
  end if;
  v_lease_owner := v_idem.lease_owner::uuid;

  /*
  Resolve/lock customer identity before financial derivation. Customer identity
  is tenant-scoped and ambiguity is a hard failure; no legacy winner is picked.
  */
  v_customer_result := public.resolve_customer_identity_result_v2(
    v_tenant_id, v_branch_id, v_user_id, p_command->'customer'
  );
  if v_customer_result is null
     or jsonb_typeof(v_customer_result) <> 'object'
     or coalesce(v_customer_result->>'customer_id','') !~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or jsonb_typeof(v_customer_result->'customer_was_created') <> 'boolean'
     or jsonb_typeof(v_customer_result->'customer_was_updated') <> 'boolean'
  then
    raise exception using errcode = 'P0001',
      message = 'CUSTOMER_PERSISTENCE_INVALID';
  end if;
  v_customer_id := (v_customer_result->>'customer_id')::uuid;
  /*
  create_new cannot resolve an existing identity: the resolver fails closed on
  conflicts. Consequently a successful create_new result is authoritative
  creation evidence; reuse/update are never classified as creation.
  */
  v_customer_was_created :=
    (v_customer_result->>'customer_was_created')::boolean;
  select * into strict v_customer
  from public.customers c
  where c.id = v_customer_id and c.tenant_id = v_tenant_id
  for share;

  /*
  4T parity boundary. Committed replay has already returned above. For a fresh
  command, lock the exact immutable context-bound quote and verify its complete
  evidence before deriving current financial state. No inventory, numbering or
  persistence stage has run yet.
  */
  select q.* into v_quote
  from public.financial_quotes q
  where q.id = nullif(p_command->>'quote_id', '')::uuid
  for share;
  if not found then
    raise exception using errcode='P0002',message='QUOTE_NOT_FOUND';
  end if;

  if v_quote.authorization_context_id is null
     or v_quote.authorization_context_id
        is distinct from v_auth.authorization_context_id
     or v_quote.issuer_context_version
        is distinct from 'atomic-auth-context-v1' then
    raise exception using errcode='42501',message='QUOTE_CONTEXT_INVALID';
  end if;
  if v_quote.tenant_id is distinct from v_tenant_id
     or v_quote.branch_id is distinct from v_branch_id then
    raise exception using errcode='42501',message='QUOTE_SCOPE_INVALID';
  end if;
  if v_quote.expires_at <= clock_timestamp() then
    raise exception using errcode='40001',message='QUOTE_EXPIRED';
  end if;

  if v_quote.quote_classification is distinct from 'advisory'
     or v_quote.quote_version is distinct from 'financial-quote-v1'
     or v_quote.financial_engine_version
        is distinct from 'financial-engine-v2-r1'
     or v_quote.request_fingerprint_version
        is distinct from 'atomic-request-fingerprint-v2'
     or v_quote.quote_snapshot_version
        is distinct from 'authoritative-quote-payload-v1'
     or v_quote.quote_payload->>'quote_payload_version'
        is distinct from 'authoritative-quote-payload-v1'
     or v_quote.quote_payload->>'quote_version'
        is distinct from 'financial-quote-v1'
     or v_quote.quote_payload->>'financial_engine_version'
        is distinct from 'financial-engine-v2-r1'
     or v_quote.quote_payload->>'request_fingerprint_version'
        is distinct from 'atomic-request-fingerprint-v2'
     or v_quote.quote_payload->>'issuer_context_version'
        is distinct from 'atomic-auth-context-v1' then
    raise exception using errcode='40001',message='QUOTE_VERSION_INVALID';
  end if;

  if v_quote.request_fingerprint is distinct from v_request_fingerprint
     or v_quote.quote_payload->>'request_fingerprint'
        is distinct from v_request_fingerprint
     or v_quote.quote_fingerprint
        is distinct from p_command->>'quote_fingerprint' then
    raise exception using
      errcode='40001',
      message='QUOTE_FINGERPRINT_MISMATCH';
  end if;

  if v_quote.quote_hash !~ '^[0-9a-f]{64}$'
     or v_quote.quote_hash is distinct from p_command->>'quote_hash'
     or public.verify_authoritative_quote_hash_v1(
       v_quote.quote_payload,v_quote.quote_hash
     ) is distinct from true then
    raise exception using errcode='40001',message='QUOTE_HASH_MISMATCH';
  end if;

  if jsonb_typeof(v_quote.quote_payload) is distinct from 'object'
     or jsonb_typeof(v_quote.quote_payload->'financial_snapshot')
        is distinct from 'object'
     or coalesce(v_quote.quote_payload->>'financial_snapshot_hash','')
        !~ '^[0-9a-f]{64}$'
     or v_quote.quote_payload->>'authorization_context_id'
        is distinct from v_auth.authorization_context_id::text
     or v_quote.quote_payload->>'tenant_id'
        is distinct from v_tenant_id::text
     or v_quote.quote_payload->>'branch_id'
        is distinct from v_branch_id::text
     or v_quote.quote_payload->'issued_at'
        is distinct from to_jsonb(v_quote.created_at)
     or v_quote.quote_payload->'expires_at'
        is distinct from to_jsonb(v_quote.expires_at) then
    raise exception using
      errcode='40001',
      message='QUOTE_FINANCIAL_SNAPSHOT_INVALID';
  end if;

  v_quoted_financial:=v_quote.quote_payload->'financial_snapshot';
  v_quoted_financial_hash:=
    v_quote.quote_payload->>'financial_snapshot_hash';

  if v_quote.financial_engine_version
       is distinct from v_quoted_financial->>'financial_engine_version'
     or v_quote.pricing_rule_version
       is distinct from v_quoted_financial->>'pricing_rule_version'
     or v_quote.vat_rule_version
       is distinct from v_quoted_financial->>'vat_rule_version'
     or v_quote.discount_rule_version
       is distinct from v_quoted_financial->>'discount_rule_version'
     or v_quote.rounding_version
       is distinct from v_quoted_financial->>'rounding_version'
     or v_quoted_financial->>'financial_snapshot_version'
       is distinct from 'financial-snapshot-v1'
     or encode(
       extensions.digest(v_quoted_financial::text,'sha256'),'hex'
     ) is distinct from v_quoted_financial_hash then
    raise exception using
      errcode='40001',
      message='QUOTE_FINANCIAL_SNAPSHOT_INVALID';
  end if;

  v_financial_result := public.derive_atomic_financial_snapshot_v2(
    v_tenant_id, v_branch_id, p_financial_snapshot
  );
  v_financial := v_financial_result->'snapshot';
  v_financial_hash := v_financial_result->>'snapshot_hash';
  if v_financial is null or jsonb_typeof(v_financial) <> 'object'
     or v_financial_hash !~ '^[0-9a-f]{64}$'
     or encode(extensions.digest(v_financial::text,'sha256'),'hex')
        <> v_financial_hash then
    raise exception using errcode = 'P0001',
      message = 'FINANCIAL_SNAPSHOT_INVALID';
  end if;

  /*
  Exact JSONB equality covers every normalized item, quantity, unit price,
  pricing source, line allocation, discount/VAT evidence, payment effect,
  currency and engine/rule version. Hash equality independently verifies the
  identical canonical jsonb::text representation used by Package 6B.
  */
  if v_financial is distinct from v_quoted_financial
     or v_financial_hash is distinct from v_quoted_financial_hash then
    raise exception using
      errcode='40001',
      message='QUOTE_FINANCIAL_SNAPSHOT_DRIFT';
  end if;

  v_expected_item_count := jsonb_array_length(v_financial->'items');
  if v_expected_item_count < 1
     or (select count(*) from jsonb_array_elements(v_financial->'items'))
        <> v_expected_item_count
     or (select count(distinct (i.value->>'line_number')::integer)
         from jsonb_array_elements(v_financial->'items') i(value))
        <> v_expected_item_count
     or (select min((i.value->>'line_number')::integer)
         from jsonb_array_elements(v_financial->'items') i(value)) <> 1
     or (select max((i.value->>'line_number')::integer)
         from jsonb_array_elements(v_financial->'items') i(value))
        <> v_expected_item_count
     or (select round(sum((i.value->>'gross_amount')::numeric),2)
         from jsonb_array_elements(v_financial->'items') i(value))
        <> (v_financial->>'subtotal')::numeric
     or (select round(sum((i.value->>'discount_allocation')::numeric),2)
         from jsonb_array_elements(v_financial->'items') i(value))
        <> (v_financial->>'discount_amount')::numeric
     or (select round(sum((i.value->>'taxable_amount')::numeric),2)
         from jsonb_array_elements(v_financial->'items') i(value))
        <> (v_financial->>'taxable_subtotal')::numeric
     or (select round(sum((i.value->>'line_total')::numeric),2)
         from jsonb_array_elements(v_financial->'items') i(value))
        <> (v_financial->>'taxable_subtotal')::numeric
     or round(
          (v_financial->>'taxable_subtotal')::numeric
          + (v_financial->>'vat_amount')::numeric,2
        ) <> (v_financial->>'total')::numeric then
    raise exception using errcode = 'P0001',
      message = 'FINANCIAL_RECONCILIATION_FAILED';
  end if;

  /*
  Package 2 generated order/invoice month columns use UTC, so Release 1 keeps
  UTC as the one numbering boundary. The transaction timestamp is stable for
  period selection and persisted dates. Package 6 must disable the legacy
  deduction/numbering triggers before this entry point can run.
  */
  v_period := date_trunc(
    'month',v_transaction_at at time zone 'UTC'
  )::date;
  perform public.assert_atomic_legacy_triggers_safe_v2();
  v_inventory_requirements := public.resolve_inventory_requirements_v2(
    v_tenant_id,v_branch_id,v_financial->'items'
  );
  v_locked_inventory := public.lock_and_validate_inventory_v2(
    v_tenant_id,v_branch_id,v_inventory_requirements
  );

  /* Number allocation occurs only after every stock row is locked/validated. */
  v_order_number := public.allocate_branch_monthly_number_v2(
    v_tenant_id, v_branch_id, v_period
  );
  v_invoice_number := v_order_number;

  begin
    insert into public.orders (
      id, order_number, customer_id, status, created_by, created_at,
      branch_id, tenant_id, created_by_employee_id,
      atomic_engine_version, financial_engine_version, correlation_id,
      idempotency_command_id, source_channel,
      customer_name_snapshot, customer_phone_snapshot,
      customer_record_version_snapshot
    )
    values (
      v_order_id, v_order_number, v_customer_id, 'in_progress', v_user_id,
      v_transaction_at, v_branch_id, v_tenant_id, v_employee_id,
      'atomic-order-v2-r1', v_financial->>'financial_engine_version',
      v_correlation_id, v_idem.id, 'atomic_rpc',
      v_customer.name, v_customer.phone, v_customer.record_version
    );
    get diagnostics v_order_count = row_count;
  exception
    when unique_violation then
      get stacked diagnostics v_unknown_key = constraint_name;
      if v_unknown_key = any(array[
        'idx_orders_tenant_branch_month_order_number_unique',
        'orders_monthly_order_number_unique'
      ]) then
        raise exception using errcode = '23505',
          message = 'NUMBER_ALLOCATION_CONFLICT';
      end if;
      if v_unknown_key = 'orders_pkey' then
        raise exception using errcode = '23505',
          message = 'ORDER_PERSISTENCE_CONFLICT';
      end if;
      raise;
  end;

  begin
    insert into public.invoices (
    id, invoice_number, order_id, customer_id, payment_method,
    payment_status, subtotal, discount, tax, total, note, created_by, created_at,
    cash_received, remaining_from_customer, cash_change, branch_id, tenant_id,
    atomic_engine_version, correlation_id, financial_quote_id,
    quote_fingerprint, financial_snapshot_version, financial_snapshot_hash,
    financial_snapshot_complete, financial_completeness_reasons,
    request_fingerprint, request_fingerprint_version, quote_version,
    financial_engine_version, payment_snapshot,
    customer_name_snapshot, customer_phone_snapshot,
    customer_email_snapshot, customer_record_version_snapshot,
    currency_code, discount_id_snapshot, discount_name_snapshot,
    discount_type_snapshot, discount_value_snapshot, discount_amount,
    taxable_subtotal, vat_setting_id_snapshot, vat_rate_snapshot, vat_amount,
    payment_rule_version, pricing_rule_version, vat_rule_version,
    discount_rule_version, rounding_version, financial_record_classification
  )
    values (
    v_invoice_id, v_invoice_number, v_order_id, v_customer_id,
    v_financial->>'payment_method', v_financial->>'payment_status',
    (v_financial->>'subtotal')::numeric,
    (v_financial->>'discount_amount')::numeric,
    (v_financial->>'vat_amount')::numeric,
    (v_financial->>'total')::numeric,
    nullif(p_command->>'note', ''), v_user_id, v_transaction_at,
    (v_financial->>'cash_received')::numeric,
    (v_financial->>'remaining_from_customer')::numeric,
    (v_financial->>'cash_change')::numeric,
    v_branch_id, v_tenant_id, 'atomic-order-v2-r1', v_correlation_id,
    v_quote.id, v_quote.quote_fingerprint, 'financial-snapshot-v1',
    v_financial_hash,
    (v_financial->>'financial_snapshot_complete')::boolean,
    v_financial->'financial_completeness_reasons',
    v_request_fingerprint, 'atomic-request-fingerprint-v2',
    v_quote.quote_version, v_financial->>'financial_engine_version',
    v_financial->'payment_snapshot',
    v_customer.name, v_customer.phone, v_customer.email,
    v_customer.record_version,
    v_financial->>'currency_code',
    nullif(v_financial->>'discount_id_snapshot','')::uuid,
    v_financial->>'discount_name_snapshot',
    v_financial->>'discount_type_snapshot',
    nullif(v_financial->>'discount_value_snapshot','')::numeric,
    (v_financial->>'discount_amount')::numeric,
    (v_financial->>'taxable_subtotal')::numeric,
    (v_financial->>'vat_setting_id_snapshot')::uuid,
    (v_financial->>'vat_rate_snapshot')::numeric,
    (v_financial->>'vat_amount')::numeric,
    v_financial->>'payment_rule_version',
    v_financial->>'pricing_rule_version',
    v_financial->>'vat_rule_version',
    v_financial->>'discount_rule_version',
    v_financial->>'rounding_version',
    v_financial->>'financial_record_classification'
    );
    get diagnostics v_invoice_count = row_count;
  exception
    when unique_violation then
      get stacked diagnostics v_unknown_key = constraint_name;
      if v_unknown_key = any(array[
        'idx_invoices_tenant_branch_month_invoice_number_unique',
        'invoices_monthly_invoice_number_unique'
      ]) then
        raise exception using errcode = '23505',
          message = 'NUMBER_ALLOCATION_CONFLICT';
      end if;
      if v_unknown_key = 'invoices_pkey' then
        raise exception using errcode = '23505',
          message = 'INVOICE_PERSISTENCE_CONFLICT';
      end if;
      raise;
  end;

  for v_item in select value from jsonb_array_elements(v_financial->'items')
  loop
    v_invoice_item_id := pg_catalog.gen_random_uuid();
    insert into public.invoice_items (
      id, invoice_id, item_id, item_name_snapshot, item_type_snapshot,
      quantity, unit_price, line_total, item_category_snapshot,
      cost_price, tenant_id, line_number, price_source,
      pricing_snapshot, inventory_snapshot_version,
      gross_amount, discount_allocation, taxable_amount,
      source_branch_price_id, source_catalog_updated_at,
      source_branch_price_updated_at, cost_snapshot, profit_snapshot,
      cost_snapshot_status, cost_snapshot_version,
      inventory_tracking_mode, inventory_movement_correlation_id
    )
    values (
      v_invoice_item_id,v_invoice_id,
      nullif(v_item->>'catalog_item_id','')::uuid,
      v_item->>'name', v_item->>'item_type',
      (v_item->>'quantity')::integer, (v_item->>'unit_price')::numeric,
      (v_item->>'line_total')::numeric, v_item->>'category',
      coalesce((v_item->>'cost_price')::numeric, 0), v_tenant_id,
      (v_item->>'line_number')::integer,
      v_item->>'price_source', v_item->'pricing_snapshot',
      'inventory-snapshot-v1',
      (v_item->>'gross_amount')::numeric,
      (v_item->>'discount_allocation')::numeric,
      (v_item->>'taxable_amount')::numeric,
      nullif(v_item->>'source_branch_price_id','')::uuid,
      nullif(v_item->>'source_catalog_updated_at','')::timestamptz,
      nullif(v_item->>'source_branch_price_updated_at','')::timestamptz,
      (v_item->>'cost_snapshot')::numeric,
      (v_item->>'profit_snapshot')::numeric,
      v_item->>'cost_snapshot_status',
      v_item->>'cost_snapshot_version',
      v_item->>'inventory_tracking_mode',
      v_correlation_id::text
    );
    get diagnostics v_updated_count = row_count;
    if v_updated_count <> 1 then
      raise exception using errcode = 'P0001',
        message = 'INVOICE_ITEM_PERSISTENCE_INVALID';
    end if;
    if v_item->>'inventory_tracking_mode' = 'tracked_product' then
      v_invoice_item_map := v_invoice_item_map || jsonb_build_array(
        jsonb_build_object(
          'catalog_item_id',v_item->>'catalog_item_id',
          'invoice_item_id',v_invoice_item_id
        )
      );
    end if;
    v_item_count := v_item_count + 1;
  end loop;
  if v_item_count = 0 then
    raise exception using errcode = '22023', message = 'EMPTY_CART';
  end if;
  if v_order_count <> 1 then
    raise exception using errcode = 'P0001',
      message = 'ORDER_PERSISTENCE_INVALID';
  end if;
  if v_invoice_count <> 1 then
    raise exception using errcode = 'P0001',
      message = 'INVOICE_PERSISTENCE_INVALID';
  end if;
  if v_item_count <> v_expected_item_count then
    raise exception using errcode = 'P0001',
      message = 'INVOICE_ITEM_PERSISTENCE_INVALID';
  end if;

  v_inventory_result := public.apply_inventory_mutations_v2(
    v_tenant_id,v_branch_id,v_order_id,v_invoice_id,v_user_id,
    v_correlation_id,v_locked_inventory,v_invoice_item_map
  );

  begin
    insert into public.audit_logs (
    tenant_id, branch_id, actor_user_id, actor_role, employee_id,
    action, event_type, entity_type, entity_id, metadata,
    order_id, invoice_id, customer_id, request_fingerprint,
    quote_fingerprint, before_snapshot, after_snapshot,
    correlation_id, audit_schema_version, created_at
  )
  values (
    v_tenant_id,v_branch_id,v_user_id,v_auth.actor_role,v_employee_id,
    'order.created.atomic_v2','order_created','order',v_order_id::text,
    jsonb_build_object(
      'authorization_source',v_auth.authorization_source,
      'authorization_context_id',v_auth.authorization_context_id,
      'idempotency_command_id',v_idem.id,
      'financial_quote_id',v_quote.id,
      'quote_version',v_quote.quote_version,
      'quote_snapshot_hash',v_quoted_financial_hash,
      'derived_snapshot_hash',v_financial_hash,
      'financial_parity_result','exact_match'
    ),
    v_order_id,v_invoice_id,v_customer_id,
    v_request_fingerprint,v_quote.quote_fingerprint,null,
    jsonb_build_object(
      'number',v_order_number,
      'item_count',v_item_count,
      'currency_code',v_financial->>'currency_code',
      'total',(v_financial->>'total')::numeric,
      'payment_method',v_financial->>'payment_method',
      'payment_status',v_financial->>'payment_status',
      'financial_snapshot_hash',v_financial_hash,
      'inventory_engine_version',
        v_inventory_result->>'inventory_engine_version',
      'inventory_evidence_refs',v_inventory_result->'evidence_refs',
      'atomic_engine_version','atomic-order-v2-r1',
      'financial_engine_version',v_financial->>'financial_engine_version'
    ),
    v_correlation_id,'atomic-audit-v1',v_transaction_at
    );
  exception
    when check_violation then
      get stacked diagnostics v_unknown_key = constraint_name;
      if v_unknown_key = any(array[
        'ck_audit_logs_request_fingerprint',
        'ck_audit_logs_quote_fingerprint',
        'ck_audit_logs_correlation_id',
        'ck_audit_logs_snapshots',
        'ck_audit_logs_schema_version'
      ]) then
        raise exception using errcode = 'P0001',
          message = 'AUDIT_PERSISTENCE_INVALID';
      end if;
      raise;
    when unique_violation then
      get stacked diagnostics v_unknown_key = constraint_name;
      if v_unknown_key = 'audit_logs_pkey' then
        raise exception using errcode = '23505',
          message = 'AUDIT_PERSISTENCE_INVALID';
      end if;
      raise;
  end;
  get diagnostics v_audit_count = row_count;
  if v_audit_count <> 1 then
    raise exception using errcode = 'P0001',
      message = 'AUDIT_PERSISTENCE_INVALID';
  end if;

  v_outbox_result := public.enqueue_atomic_outbox_v2(
    v_tenant_id,v_branch_id,v_order_id,v_invoice_id,v_customer_id,
    v_customer_was_created,v_order_number,v_financial->>'currency_code',
    (v_financial->>'total')::numeric,v_financial->>'payment_method',
    v_financial->>'payment_status',v_financial_hash,v_inventory_result,
    v_correlation_id,v_transaction_at
  );
  v_expected_outbox_count := 1
    + case when v_customer_was_created then 1 else 0 end
    + case when (v_inventory_result->>'tracked_items_mutated')::integer > 0
        then 1 else 0 end;
  if (v_outbox_result->>'events_inserted')::integer
       <> v_expected_outbox_count
     or jsonb_array_length(v_outbox_result->'payload_hashes')
       <> v_expected_outbox_count
     or exists (
       select 1
       from public.atomic_outbox o
       where o.correlation_id = v_correlation_id::text
         and o.payload_hash <> encode(
           extensions.digest(o.payload::text,'sha256'),'hex'
         )
     )
     or (select count(*)
         from public.atomic_outbox o
         where o.correlation_id = v_correlation_id::text)
        <> v_expected_outbox_count then
    raise exception using errcode = 'P0001',
      message = 'ATOMIC_EVIDENCE_INCOMPLETE';
  end if;

  if (v_inventory_result->>'movements_inserted')::integer
       <> (v_locked_inventory->>'locked_count')::integer
     or (v_inventory_result->>'tracked_items_mutated')::integer
       <> (v_locked_inventory->>'locked_count')::integer then
    raise exception using errcode = 'P0001',
      message = 'ATOMIC_EVIDENCE_INCOMPLETE';
  end if;

  v_result := public.build_atomic_order_response_v1(v_order_id,v_invoice_id);
  v_result_hash := encode(extensions.digest(v_result::text, 'sha256'), 'hex');

  update public.idempotency_commands
  set state = 'committed', order_id = v_order_id, invoice_id = v_invoice_id,
      response_version = 'atomic-order-response-v1',
      response_hash = v_result_hash, committed_at = clock_timestamp(),
      lease_owner = null, lease_expires_at = null,
      recovery_completed_at = case
        when recovery_started_at is null then null else clock_timestamp()
      end,
      failed_at = null, last_error_code = null,
      updated_at = clock_timestamp()
  where id = v_idem.id
    and state = 'started'
    and lease_owner = v_lease_owner::text
    and order_id is null
    and invoice_id is null;
  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 1 then
    raise exception using errcode = '40001',
      message = 'IDEMPOTENCY_COMMIT_CONFLICT';
  end if;

  select * into v_committed_idem
  from public.idempotency_commands
  where id = v_idem.id;
  if not found
     or v_committed_idem.state <> 'committed'
     or v_committed_idem.lease_owner is not null
     or v_committed_idem.order_id <> v_order_id
     or v_committed_idem.invoice_id <> v_invoice_id
     or v_committed_idem.response_version <> 'atomic-order-response-v1'
     or v_committed_idem.response_hash <> v_result_hash then
    raise exception using errcode = '40001',
      message = 'IDEMPOTENCY_COMMIT_CONFLICT';
  end if;

  return v_result;
end;
$function$;

/*
Package 4 closes the default function-exposure window itself. Package 5 owns
final ownership/RLS and Package 6 owns the eventual approved entry-point grant.
No helper or entry point is executable by browser or service roles here.
*/
revoke all on function public.resolve_atomic_authorization_v2(jsonb,jsonb)
  from public, anon, authenticated, service_role,
       afex_context_issuer, afex_outbox_worker;
revoke all on function public.normalize_customer_phone_v2(text)
  from public, anon, authenticated, service_role,
       afex_context_issuer, afex_outbox_worker;
revoke all on function public.resolve_customer_identity_v2(
  uuid,uuid,uuid,jsonb
) from public, anon, authenticated, service_role,
       afex_context_issuer, afex_outbox_worker;
revoke all on function public.resolve_customer_identity_result_v2(
  uuid,uuid,uuid,jsonb
) from public, anon, authenticated, service_role,
       afex_context_issuer, afex_outbox_worker;
revoke all on function public.build_atomic_request_fingerprint_v2(jsonb,jsonb)
  from public, anon, authenticated, service_role,
       afex_context_issuer, afex_outbox_worker;
revoke all on function public.derive_atomic_financial_snapshot_v2(
  uuid,uuid,jsonb
) from public, anon, authenticated, service_role,
       afex_context_issuer, afex_outbox_worker;
revoke all on function public.acquire_idempotency_command_v2(
  uuid,uuid,text,text,text,uuid,uuid,text,uuid
) from public, anon, authenticated, service_role,
       afex_context_issuer, afex_outbox_worker;
revoke all on function public.build_atomic_order_response_v1(uuid,uuid)
  from public, anon, authenticated, service_role,
       afex_context_issuer, afex_outbox_worker;
revoke all on function public.allocate_branch_monthly_number_v2(uuid,uuid,date)
  from public, anon, authenticated, service_role,
       afex_context_issuer, afex_outbox_worker;
revoke all on function public.assert_atomic_legacy_triggers_safe_v2()
  from public, anon, authenticated, service_role,
       afex_context_issuer, afex_outbox_worker;
revoke all on function public.resolve_inventory_requirements_v2(
  uuid,uuid,jsonb
) from public, anon, authenticated, service_role,
       afex_context_issuer, afex_outbox_worker;
revoke all on function public.lock_and_validate_inventory_v2(
  uuid,uuid,jsonb
) from public, anon, authenticated, service_role,
       afex_context_issuer, afex_outbox_worker;
revoke all on function public.build_inventory_movement_evidence_v2(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,numeric,numeric,numeric,bigint,bigint
) from public, anon, authenticated, service_role,
       afex_context_issuer, afex_outbox_worker;
revoke all on function public.apply_inventory_mutations_v2(
  uuid,uuid,uuid,uuid,uuid,uuid,jsonb,jsonb
) from public, anon, authenticated, service_role,
       afex_context_issuer, afex_outbox_worker;
revoke all on function public.atomic_semantic_event_uuid_v1(text)
  from public, anon, authenticated, service_role,
       afex_context_issuer, afex_outbox_worker;
revoke all on function public.enqueue_atomic_outbox_v2(
  uuid,uuid,uuid,uuid,uuid,boolean,text,text,numeric,text,text,text,jsonb,
  uuid,timestamptz
) from public, anon, authenticated, service_role,
       afex_context_issuer, afex_outbox_worker;
revoke all on function public.create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)
  from public, anon, authenticated, service_role,
       afex_core_runtime, afex_context_issuer, afex_outbox_worker,
       afex_core_activation_operator;
drop function if exists public.enqueue_atomic_outbox_v1(
  uuid,uuid,uuid,uuid,uuid,jsonb
);

commit;

-- 4T read-only static proof. Every result must be true before review approval.
with definition as (
  select pg_get_functiondef(
    'public.create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)'::regprocedure
  ) body
),
positions as (
  select
    body,
    strpos(body,'if v_idem.state = ''committed''') replay_position,
    strpos(body,'select q.* into v_quote') quote_position,
    strpos(
      body,
      'v_financial_result := public.derive_atomic_financial_snapshot_v2'
    ) derivation_position,
    strpos(
      body,
      'if v_financial is distinct from v_quoted_financial'
    ) parity_position,
    strpos(
      body,
      'v_inventory_requirements := public.resolve_inventory_requirements_v2'
    ) inventory_position,
    strpos(
      body,
      'v_order_number := public.allocate_branch_monthly_number_v2'
    ) numbering_position,
    strpos(body,'insert into public.orders') persistence_position
  from definition
)
select
  replay_position > 0
    and replay_position < quote_position as replay_precedes_quote,
  quote_position < derivation_position as quote_precedes_derivation,
  derivation_position < parity_position as derivation_precedes_parity,
  parity_position < inventory_position as parity_precedes_inventory,
  parity_position < numbering_position as parity_precedes_numbering,
  parity_position < persistence_position as parity_precedes_persistence,
  (
    select count(*)
    from regexp_matches(
      body,
      'public[.]verify_authoritative_quote_hash_v1[(]',
      'g'
    )
  ) = 1 as canonical_quote_hash_helper_called_once,
  (
    select count(*)
    from regexp_matches(
      body,
      'public[.]derive_atomic_financial_snapshot_v2[(]',
      'g'
    )
  ) = 1 as authoritative_snapshot_derived_once,
  body like '%v_financial is distinct from v_quoted_financial%'
    as complete_jsonb_snapshot_equality_present,
  body like
    '%v_financial_hash is distinct from v_quoted_financial_hash%'
    as exact_snapshot_hash_parity_present,
  body !~* '(epsilon|tolerance|approximately|approximate)'
    as no_numeric_tolerance_comparison,
  body not like '%when others%' as no_broad_exception_handler
from positions;

with roles(role_name) as (values
  ('PUBLIC'),('anon'),('authenticated'),('service_role'),
  ('afex_core_runtime'),('afex_context_issuer'),('afex_outbox_worker'),
  ('afex_core_activation_operator')
)
select
  role_name,
  not has_function_privilege(
    role_name,
    'public.create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ) as atomic_execute_closed
from roles
order by role_name;

/*
Runtime lock order:
1 atomic_authorization_contexts token row (FOR UPDATE), followed by current
  profile/branch/POS binding revalidation
2 idempotency_commands identity row (FOR UPDATE)
3 matching customer identity row (FOR UPDATE)
4 financial_quotes row (FOR SHARE), including exact context linkage
5 catalog/branch-price rows ordered by catalog_item_id, then discount/VAT rows
  (FOR SHARE)
6 inventory_stock rows ordered by catalog_item_id, id (FOR UPDATE)
7 order_number_sequences tenant/branch/month row (FOR UPDATE)
8 persistence inserts, inventory movements, then stock updates
9 audit/outbox/idempotency commit

Security note: execution remains unavailable until the Package 5R amendments
identified by 4S are applied and Package 6 activation gates pass.

4T snapshot mapping:
- quote_payload.financial_snapshot <-> derive result.snapshot (exact JSONB)
- quote_payload.financial_snapshot_hash <-> derive result.snapshot_hash
- row/payload financial_engine_version <-> snapshot financial_engine_version
- row pricing/vat/discount/rounding versions <-> matching snapshot versions
- row/payload request_fingerprint <-> recalculated Package 4 fingerprint
- row/payload context, tenant and branch <-> consumed trusted context
- row quote_hash <-> verify_authoritative_quote_hash_v1(payload,hash)

4T drift and retry contract:
- parity failure occurs inside the same transaction, so context consumption,
  idempotency acquisition and any create_new customer resolution roll back;
- one-context/one-quote means a changed configuration requires a new context
  and freshly issued quote;
- committed replay returns before quote expiry, hash or parity evaluation;
- quote issuer lock order remains context -> configuration -> quote insert;
- atomic lock order remains context -> idempotency -> customer -> quote ->
  configuration -> inventory -> numbering, so 4T adds no reversed lock edge.

Required dependency follow-up:
- Package 5R-B records the new Package 4T hash and adopts the shared consuming
  validator without changing this function signature.
- Package 6 and 6A update the Package 4 dependency hash; Package 6A retains
  disabled flags and requires Package 7 parity evidence before activation.
*/
