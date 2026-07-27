/*
AFEX Core V2 I5.9 - Package 5R-B: Security Remediation
Shared Authorization Validation Adoption and Package 4T Synchronization

PURPOSE
  Establish fail-closed ownership, least privilege, trusted short-lived
  authorization-context issuance/consumption, and outbox worker isolation.

BOUNDARY
  This package does not activate create_order_atomic_v2, alter its business
  logic, calculate financial quotes, mutate historical business data, replace
  legacy triggers, or perform provider delivery.

DEPENDENCIES (must be byte-for-byte reviewed before execution)
  02c-security-foundation.sql
    SHA-256 009395af590b53c39a33004c3ad63d1e28a176291d5cfbaa6feb9b71329e591d
  04-atomic-core.sql
    SHA-256 40900e9e2bed32ef1f3064881081892719037924d19dfb9a6ff37f5d2feecfe7
  06b-authoritative-quote.sql
    SHA-256 46c0db2c04a2f48dd1519f72a8f627ca2ceae3ad0ad6af21a7897bc2bc3914ff

ACTIVATION BLOCKERS
  1. Package 4T consumes the internal
     consume_atomic_authorization_context_v1 contract. Package 6 must retain
     the strict opaque-token entry path and its activation gates.
  2. The application needs a separately reviewed server-only database caller
     identity. Neither authenticated nor service_role receives issuer EXECUTE
     here: authenticated would expose the RPC directly to browsers, while
     service_role alone cannot prove an end-user identity.
  3. Package 6B defines the ungranted authoritative quote issuer and the shared
     context validator. Package 5R-B delegates consuming validation to that
     helper without exposing either function to runtime or browser roles.
*/

-- ===========================================================================
-- A. FAIL-CLOSED PREFLIGHT (read-only)
-- ===========================================================================

do $preflight$
declare
  v_missing text;
  v_unexpected text;
  v_shared_oid oid;
  v_shared_result text;
begin
  if to_regclass('public.atomic_authorization_contexts') is null
     or to_regclass('public.financial_quotes') is null
     or to_regclass('public.idempotency_commands') is null
     or to_regclass('public.atomic_outbox') is null then
    raise exception using errcode = '55000',
      message = 'SECURITY_FOUNDATION_REQUIRED';
  end if;

  if to_regprocedure(
    'public.verify_pos_pin_for_actor(text,uuid,uuid)'
  ) is null then
    raise exception using errcode = '55000',
      message = 'POS_VERIFIER_REQUIRED';
  end if;
  if to_regprocedure('extensions.digest(text,text)') is null
     or to_regprocedure('extensions.gen_random_bytes(integer)') is null then
    raise exception using errcode = '55000',
      message = 'PGCRYPTO_FUNCTIONS_REQUIRED';
  end if;

  with expected(signature) as (
    values
      ('resolve_atomic_authorization_v2(jsonb,jsonb)'),
      ('normalize_customer_phone_v2(text)'),
      ('resolve_customer_identity_v2(uuid,uuid,uuid,jsonb)'),
      ('resolve_customer_identity_result_v2(uuid,uuid,uuid,jsonb)'),
      ('build_atomic_request_fingerprint_v2(jsonb,jsonb)'),
      ('acquire_idempotency_command_v2(uuid,uuid,text,text,text,uuid,uuid,text,uuid)'),
      ('build_atomic_order_response_v1(uuid,uuid)'),
      ('allocate_branch_monthly_number_v2(uuid,uuid,date)'),
      ('assert_atomic_legacy_triggers_safe_v2()'),
      ('resolve_inventory_requirements_v2(uuid,uuid,jsonb)'),
      ('lock_and_validate_inventory_v2(uuid,uuid,jsonb)'),
      ('build_inventory_movement_evidence_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,numeric,numeric,numeric,bigint,bigint)'),
      ('apply_inventory_mutations_v2(uuid,uuid,uuid,uuid,uuid,uuid,jsonb,jsonb)'),
      ('atomic_semantic_event_uuid_v1(text)'),
      ('enqueue_atomic_outbox_v2(uuid,uuid,uuid,uuid,uuid,boolean,text,text,numeric,text,text,text,jsonb,uuid,timestamp with time zone)'),
      ('derive_atomic_financial_snapshot_v2(uuid,uuid,jsonb)'),
      ('create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)')
  )
  select string_agg(signature,', ' order by signature)
  into v_missing
  from expected
  where to_regprocedure('public.' || signature) is null;

  if v_missing is not null then
    raise exception using errcode = '55000',
      message = 'PACKAGE4_SIGNATURE_MISSING',
      detail = v_missing;
  end if;

  with expected(proname,identity_args) as (
    values
      ('resolve_atomic_authorization_v2','jsonb, jsonb'),
      ('normalize_customer_phone_v2','text'),
      ('resolve_customer_identity_v2','uuid, uuid, uuid, jsonb'),
      ('resolve_customer_identity_result_v2','uuid, uuid, uuid, jsonb'),
      ('build_atomic_request_fingerprint_v2','jsonb, jsonb'),
      ('acquire_idempotency_command_v2','uuid, uuid, text, text, text, uuid, uuid, text, uuid'),
      ('build_atomic_order_response_v1','uuid, uuid'),
      ('allocate_branch_monthly_number_v2','uuid, uuid, date'),
      ('assert_atomic_legacy_triggers_safe_v2',''),
      ('resolve_inventory_requirements_v2','uuid, uuid, jsonb'),
      ('lock_and_validate_inventory_v2','uuid, uuid, jsonb'),
      ('build_inventory_movement_evidence_v2','uuid, uuid, uuid, uuid, uuid, uuid, uuid, numeric, numeric, numeric, bigint, bigint'),
      ('apply_inventory_mutations_v2','uuid, uuid, uuid, uuid, uuid, uuid, jsonb, jsonb'),
      ('atomic_semantic_event_uuid_v1','text'),
      ('enqueue_atomic_outbox_v2','uuid, uuid, uuid, uuid, uuid, boolean, text, text, numeric, text, text, text, jsonb, uuid, timestamp with time zone'),
      ('derive_atomic_financial_snapshot_v2','uuid, uuid, jsonb'),
      ('create_order_atomic_v2','jsonb, jsonb, jsonb, jsonb')
  ),
  actual as (
    select p.proname,pg_get_function_identity_arguments(p.oid) identity_args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (select proname from expected)
  )
  select string_agg(
    format('%I(%s)',a.proname,a.identity_args),', '
    order by a.proname,a.identity_args
  )
  into v_unexpected
  from actual a
  left join expected e
    on e.proname = a.proname and e.identity_args = a.identity_args
  where e.proname is null;

  if v_unexpected is not null then
    raise exception using errcode = '55000',
      message = 'PACKAGE4_UNEXPECTED_OVERLOAD',
      detail = v_unexpected;
  end if;

  v_shared_oid:=to_regprocedure(
    'public.validate_atomic_authorization_context_internal_v1('
    || 'text,text,text,uuid)'
  );
  if v_shared_oid is null then
    raise exception using errcode='55000',
      message='PACKAGE6B_SHARED_VALIDATOR_REQUIRED';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='validate_atomic_authorization_context_internal_v1'
      and p.oid<>v_shared_oid
  ) then
    raise exception using errcode='55000',
      message='PACKAGE6B_SHARED_VALIDATOR_OVERLOAD';
  end if;

  select pg_get_function_result(v_shared_oid)
  into v_shared_result;
  if v_shared_result is distinct from
    'TABLE(authorization_context_id uuid, actor_user_id uuid, '
    || 'tenant_id uuid, branch_id uuid, actor_role text, employee_id uuid, '
    || 'authorization_source text, idempotency_key_hash text, '
    || 'context_version text, expires_at timestamp with time zone, '
    || 'correlation_id uuid)' then
    raise exception using errcode='55000',
      message='PACKAGE6B_SHARED_VALIDATOR_RETURN_MISMATCH';
  end if;

  if not exists (
    select 1
    from pg_proc p
    where p.oid=v_shared_oid
      and p.proowner='afex_core_owner'::regrole
      and p.prosecdef
      and p.provolatile='v'
      and p.proconfig=array['search_path=pg_catalog']::text[]
  ) then
    raise exception using errcode='55000',
      message='PACKAGE6B_SHARED_VALIDATOR_SECURITY_MISMATCH';
  end if;

  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid='public.atomic_authorization_contexts'::regclass
      and c.conname='ck_atomic_authorization_contexts_actor_identity'
      and c.contype='c'
      and c.convalidated
      and pg_get_constraintdef(c.oid) like
        '%pos_verification_version = ''verify_pos_pin_for_actor-v1''%'
      and pg_get_constraintdef(c.oid) like
        '%authorization_source = ''authenticated_user_jwt''%'
      and pg_get_constraintdef(c.oid) like
        '%authorization_source = ''pos_pin_server''%'
  ) then
    raise exception using errcode='55000',
      message='PACKAGE6B_CONTEXT_IDENTITY_CONSTRAINT_MISMATCH';
  end if;

  if exists (
    select 1
    from (values
      ('PUBLIC'),('anon'),('authenticated'),('service_role'),
      ('afex_core_runtime'),('afex_context_issuer'),
      ('afex_outbox_worker'),('afex_core_activation_operator')
    ) roles(role_name)
    where has_function_privilege(
      role_name,
      v_shared_oid,
      'EXECUTE'
    )
  ) then
    raise exception using errcode='55000',
      message='PACKAGE6B_SHARED_VALIDATOR_EXPOSED';
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'validate_and_apply_inventory_v2',
        'enqueue_atomic_outbox_v1'
      )
  ) then
    raise exception using errcode = '55000',
      message = 'STALE_PACKAGE4_FUNCTION_PRESENT';
  end if;
end;
$preflight$;

begin;

-- ===========================================================================
-- B. DEDICATED NOLOGIN ROLES AND DRIFT CHECKS
-- ===========================================================================

do $roles$
declare
  v_role text;
  v_row pg_roles%rowtype;
begin
  if not exists (select 1 from pg_roles where rolname='afex_core_owner') then
    create role afex_core_owner nologin nosuperuser nocreatedb nocreaterole
      noinherit noreplication nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname='afex_context_issuer') then
    create role afex_context_issuer nologin nosuperuser nocreatedb nocreaterole
      noinherit noreplication nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname='afex_outbox_worker') then
    create role afex_outbox_worker nologin nosuperuser nocreatedb nocreaterole
      noinherit noreplication nobypassrls;
  end if;

  foreach v_role in array array[
    'afex_core_owner','afex_context_issuer','afex_outbox_worker'
  ]
  loop
    select * into strict v_row from pg_roles where rolname=v_role;
    if v_row.rolcanlogin or v_row.rolsuper or v_row.rolcreatedb
       or v_row.rolcreaterole or v_row.rolinherit or v_row.rolreplication
       or v_row.rolbypassrls then
      raise exception using errcode='55000',
        message='DEDICATED_ROLE_UNSAFE',
        detail=v_role;
    end if;
  end loop;

  if exists (
    select 1
    from pg_auth_members m
    join pg_roles member_role on member_role.oid=m.member
    join pg_roles granted_role on granted_role.oid=m.roleid
    where granted_role.rolname in (
      'afex_core_owner','afex_context_issuer','afex_outbox_worker'
    )
  ) then
    raise exception using errcode='55000',
      message='DEDICATED_ROLE_MEMBERSHIP_UNSAFE';
  end if;
end;
$roles$;

-- ===========================================================================
-- C. SCHEMA AND DEFAULT-PRIVILEGE HARDENING
-- ===========================================================================

revoke create on schema public from public,anon,authenticated,service_role;
grant usage on schema public to afex_core_owner,afex_context_issuer,
  afex_outbox_worker;
grant usage on schema extensions to afex_core_owner,afex_context_issuer;
grant usage on schema auth to afex_context_issuer;
grant execute on function extensions.digest(text,text)
  to afex_core_owner,afex_context_issuer;
grant execute on function extensions.gen_random_bytes(integer)
  to afex_context_issuer;

alter default privileges in schema public
  revoke execute on functions from public;
alter default privileges for role afex_core_owner in schema public
  revoke execute on functions from public;
alter default privileges for role afex_context_issuer in schema public
  revoke execute on functions from public;
alter default privileges for role afex_core_owner in schema public
  revoke select,insert,update,delete,truncate,references,trigger
  on tables from public;
alter default privileges for role afex_context_issuer in schema public
  revoke select,insert,update,delete,truncate,references,trigger
  on tables from public;
alter default privileges for role afex_core_owner in schema public
  revoke usage,select,update on sequences from public;
alter default privileges for role afex_context_issuer in schema public
  revoke usage,select,update on sequences from public;

-- ===========================================================================
-- D. PACKAGE 4 OWNERSHIP, REVOCATION, AND MINIMUM TABLE RIGHTS
-- ===========================================================================

alter function public.resolve_atomic_authorization_v2(jsonb,jsonb)
  owner to afex_core_owner;
alter function public.normalize_customer_phone_v2(text)
  owner to afex_core_owner;
alter function public.resolve_customer_identity_v2(uuid,uuid,uuid,jsonb)
  owner to afex_core_owner;
alter function public.resolve_customer_identity_result_v2(uuid,uuid,uuid,jsonb)
  owner to afex_core_owner;
alter function public.build_atomic_request_fingerprint_v2(jsonb,jsonb)
  owner to afex_core_owner;
alter function public.acquire_idempotency_command_v2(
  uuid,uuid,text,text,text,uuid,uuid,text,uuid
) owner to afex_core_owner;
alter function public.build_atomic_order_response_v1(uuid,uuid)
  owner to afex_core_owner;
alter function public.allocate_branch_monthly_number_v2(uuid,uuid,date)
  owner to afex_core_owner;
alter function public.assert_atomic_legacy_triggers_safe_v2()
  owner to afex_core_owner;
alter function public.resolve_inventory_requirements_v2(uuid,uuid,jsonb)
  owner to afex_core_owner;
alter function public.lock_and_validate_inventory_v2(uuid,uuid,jsonb)
  owner to afex_core_owner;
alter function public.build_inventory_movement_evidence_v2(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid,numeric,numeric,numeric,bigint,bigint
) owner to afex_core_owner;
alter function public.apply_inventory_mutations_v2(
  uuid,uuid,uuid,uuid,uuid,uuid,jsonb,jsonb
) owner to afex_core_owner;
alter function public.atomic_semantic_event_uuid_v1(text)
  owner to afex_core_owner;
alter function public.enqueue_atomic_outbox_v2(
  uuid,uuid,uuid,uuid,uuid,boolean,text,text,numeric,text,text,text,
  jsonb,uuid,timestamp with time zone
) owner to afex_core_owner;
alter function public.derive_atomic_financial_snapshot_v2(uuid,uuid,jsonb)
  owner to afex_core_owner;
alter function public.create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)
  owner to afex_core_owner;

revoke execute on function
  public.resolve_atomic_authorization_v2(jsonb,jsonb),
  public.normalize_customer_phone_v2(text),
  public.resolve_customer_identity_v2(uuid,uuid,uuid,jsonb),
  public.resolve_customer_identity_result_v2(uuid,uuid,uuid,jsonb),
  public.build_atomic_request_fingerprint_v2(jsonb,jsonb),
  public.acquire_idempotency_command_v2(
    uuid,uuid,text,text,text,uuid,uuid,text,uuid
  ),
  public.build_atomic_order_response_v1(uuid,uuid),
  public.allocate_branch_monthly_number_v2(uuid,uuid,date),
  public.assert_atomic_legacy_triggers_safe_v2(),
  public.resolve_inventory_requirements_v2(uuid,uuid,jsonb),
  public.lock_and_validate_inventory_v2(uuid,uuid,jsonb),
  public.build_inventory_movement_evidence_v2(
    uuid,uuid,uuid,uuid,uuid,uuid,uuid,numeric,numeric,numeric,bigint,bigint
  ),
  public.apply_inventory_mutations_v2(
    uuid,uuid,uuid,uuid,uuid,uuid,jsonb,jsonb
  ),
  public.atomic_semantic_event_uuid_v1(text),
  public.enqueue_atomic_outbox_v2(
    uuid,uuid,uuid,uuid,uuid,boolean,text,text,numeric,text,text,text,
    jsonb,uuid,timestamp with time zone
  ),
  public.derive_atomic_financial_snapshot_v2(uuid,uuid,jsonb),
  public.create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)
from public,anon,authenticated,service_role,afex_context_issuer,
  afex_outbox_worker,afex_core_runtime,afex_core_activation_operator;

revoke execute on function
  public.validate_atomic_authorization_context_internal_v1(
    text,text,text,uuid
  )
from public,anon,authenticated,service_role,afex_core_runtime,
  afex_context_issuer,afex_outbox_worker,afex_core_activation_operator;

grant select on table
  public.profiles,public.pos_profiles,public.tenants,public.branches,
  public.catalog_items,
  public.branch_catalog_items,public.discounts,public.vat_settings,
  public.financial_quotes
to afex_core_owner;
grant select,insert,update on table
  public.customers,public.idempotency_commands,
  public.order_number_sequences,public.inventory_stock
to afex_core_owner;
grant select,insert on table
  public.orders,public.invoices,public.invoice_items,
  public.inventory_movements,public.audit_logs,public.atomic_outbox
to afex_core_owner;
grant select,update on table public.atomic_authorization_contexts
  to afex_core_owner;

-- ===========================================================================
-- E. INTERNAL TABLE DIRECT-ACCESS REVOCATION AND NARROW RLS
-- ===========================================================================

revoke select,insert,update,delete,truncate,references,trigger
  on table public.atomic_authorization_contexts
  from public,anon,authenticated,service_role,afex_outbox_worker;
revoke select,insert,update,delete,truncate,references,trigger
  on table public.idempotency_commands
  from public,anon,authenticated,service_role,afex_context_issuer,
       afex_outbox_worker;
revoke select,insert,update,delete,truncate,references,trigger
  on table public.atomic_outbox
  from public,anon,authenticated,service_role,afex_context_issuer,
       afex_outbox_worker;
revoke insert,update,delete,truncate,references,trigger
  on table public.financial_quotes
  from public,anon,authenticated,service_role,afex_context_issuer,
       afex_outbox_worker;
revoke select on table public.financial_quotes
  from public,anon,authenticated,service_role,afex_context_issuer,
       afex_outbox_worker;

alter table public.atomic_authorization_contexts enable row level security;
alter table public.financial_quotes enable row level security;
alter table public.idempotency_commands enable row level security;
alter table public.atomic_outbox enable row level security;

drop policy if exists context_issuer_insert_v1
  on public.atomic_authorization_contexts;
create policy context_issuer_insert_v1
  on public.atomic_authorization_contexts
  for insert to afex_context_issuer
  with check (
    state='issued'
    and purpose='create_order_atomic_v2'
    and context_version='atomic-auth-context-v1'
  );

drop policy if exists context_issuer_revoke_v1
  on public.atomic_authorization_contexts;
create policy context_issuer_revoke_v1
  on public.atomic_authorization_contexts
  for update to afex_context_issuer
  using (state='issued')
  with check (state in ('issued','revoked'));

drop policy if exists context_issuer_read_v1
  on public.atomic_authorization_contexts;
create policy context_issuer_read_v1
  on public.atomic_authorization_contexts
  for select to afex_context_issuer
  using (authenticated_user_id=auth.uid());

drop policy if exists context_core_consume_v1
  on public.atomic_authorization_contexts;
create policy context_core_consume_v1
  on public.atomic_authorization_contexts
  for all to afex_core_owner
  using (true) with check (true);

drop policy if exists financial_quotes_core_read_v1
  on public.financial_quotes;
create policy financial_quotes_core_read_v1
  on public.financial_quotes
  for select to afex_core_owner using (true);

drop policy if exists idempotency_core_v1 on public.idempotency_commands;
create policy idempotency_core_v1
  on public.idempotency_commands
  for all to afex_core_owner
  using (true) with check (true);

drop policy if exists outbox_core_v1 on public.atomic_outbox;
create policy outbox_core_v1
  on public.atomic_outbox
  for all to afex_core_owner
  using (true) with check (true);

grant select,insert,update on table public.atomic_authorization_contexts
  to afex_context_issuer;
grant select on table public.profiles,public.tenants,public.branches,
  public.pos_profiles to afex_context_issuer;
grant execute on function auth.uid() to afex_context_issuer;
grant execute on function
  public.verify_pos_pin_for_actor(text,uuid,uuid)
to afex_context_issuer;

-- ===========================================================================
-- F. TRUSTED CONTEXT ISSUERS
-- No runtime EXECUTE is granted in Package 5R.
-- ===========================================================================

create or replace function public.issue_atomic_authorization_context_v1(
  p_requested_branch_id uuid,
  p_idempotency_key_hash text,
  p_server_request_id text default null
)
returns table(context_id uuid,context_token text,expires_at timestamptz)
language plpgsql volatile parallel unsafe security definer
set search_path=pg_catalog
as $function$
declare
  v_user_id uuid:=auth.uid();
  v_profile public.profiles%rowtype;
  v_branch_id uuid;
  v_token text;
  v_expires_at timestamptz;
begin
  if v_user_id is null then
    raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED';
  end if;
  if p_idempotency_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='22023',
      message='CONTEXT_IDEMPOTENCY_HASH_INVALID';
  end if;
  if p_server_request_id is not null
     and length(p_server_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='CONTEXT_SCOPE_INVALID';
  end if;

  select p.* into v_profile
  from public.profiles p
  where p.id=v_user_id and p.tenant_id is not null
    and coalesce(p.is_active,true)=true
  for share;
  if not found then
    raise exception using errcode='42501',
      message='CONTEXT_ISSUER_NOT_AUTHORIZED';
  end if;
  if v_profile.role not in ('owner','admin','manager','employee','cashier') then
    raise exception using errcode='42501',message='CONTEXT_ROLE_INVALID';
  end if;

  if v_profile.role in ('owner','admin','manager') then
    v_branch_id:=p_requested_branch_id;
  else
    if p_requested_branch_id is not null
       and p_requested_branch_id is distinct from v_profile.branch_id then
      raise exception using errcode='42501',message='CONTEXT_SCOPE_INVALID';
    end if;
    v_branch_id:=v_profile.branch_id;
  end if;
  if v_branch_id is null or not exists (
    select 1 from public.branches b
    where b.id=v_branch_id and b.tenant_id=v_profile.tenant_id
  ) then
    raise exception using errcode='42501',message='CONTEXT_SCOPE_INVALID';
  end if;

  v_token:=encode(extensions.gen_random_bytes(32),'hex');
  if v_token !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='55000',
      message='CONTEXT_TOKEN_GENERATION_FAILED';
  end if;
  v_expires_at:=clock_timestamp()+interval '5 minutes';

  return query
  insert into public.atomic_authorization_contexts as c(
    context_secret_hash,authenticated_user_id,tenant_id,branch_id,
    profile_employee_id,actor_role,authorization_source,purpose,
    idempotency_key_hash,context_version,issued_by_service,issuer_version,
    server_request_id,state,issued_at,expires_at
  ) values (
    encode(extensions.digest(v_token,'sha256'),'hex'),
    v_user_id,v_profile.tenant_id,v_branch_id,
    case when v_profile.role in ('employee','cashier') then v_user_id end,
    v_profile.role,'authenticated_user_jwt','create_order_atomic_v2',
    p_idempotency_key_hash,'atomic-auth-context-v1',
    'afex_context_issuer','issue-atomic-context-v1',
    p_server_request_id,'issued',clock_timestamp(),v_expires_at
  )
  returning c.context_id,v_token,v_expires_at;
end;
$function$;

create or replace function public.issue_pos_atomic_authorization_context_v1(
  p_raw_pin text,
  p_requested_branch_id uuid,
  p_idempotency_key_hash text,
  p_server_request_id text default null
)
returns table(context_id uuid,context_token text,expires_at timestamptz)
language plpgsql volatile parallel unsafe security definer
set search_path=pg_catalog
as $function$
declare
  v_user_id uuid:=auth.uid();
  v_profile public.profiles%rowtype;
  v_pos_id uuid;
  v_pos_role text;
  v_pos_branch_id uuid;
  v_count integer;
  v_token text;
  v_verified_at timestamptz;
  v_issued_at timestamptz;
  v_expires_at timestamptz;
begin
  if v_user_id is null then
    raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED';
  end if;
  if p_raw_pin !~ '^[0-9]{4}$' then
    raise exception using errcode='28000',message='POS_AUTHENTICATION_FAILED';
  end if;
  if p_idempotency_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode='22023',
      message='CONTEXT_IDEMPOTENCY_HASH_INVALID';
  end if;
  if p_server_request_id is not null
     and length(p_server_request_id) not between 1 and 128 then
    raise exception using errcode='22023',message='CONTEXT_SCOPE_INVALID';
  end if;

  select p.* into v_profile
  from public.profiles p
  where p.id=v_user_id and p.tenant_id is not null
    and coalesce(p.is_active,true)=true
  for share;
  if not found then
    raise exception using errcode='42501',
      message='CONTEXT_ISSUER_NOT_AUTHORIZED';
  end if;

  select count(*)
  into v_count
  from public.verify_pos_pin_for_actor(
    p_raw_pin,v_user_id,p_requested_branch_id
  ) x;
  if v_count<>1 then
    raise exception using errcode='28000',message='POS_AUTHENTICATION_FAILED';
  end if;
  select x.id,x.role,x.branch_id
  into v_pos_id,v_pos_role,v_pos_branch_id
  from public.verify_pos_pin_for_actor(
    p_raw_pin,v_user_id,p_requested_branch_id
  ) x;
  if v_pos_role not in ('admin','manager','employee','cashier')
     or v_pos_branch_id is null then
    raise exception using errcode='42501',message='POS_SCOPE_INVALID';
  end if;

  select pp.id,pp.role,pp.branch_id
  into v_pos_id,v_pos_role,v_pos_branch_id
  from public.pos_profiles pp
  where pp.id=v_pos_id and pp.tenant_id=v_profile.tenant_id
    and pp.branch_id=v_pos_branch_id and pp.is_active=true
    and pp.role in ('admin','manager','employee','cashier')
  for share;
  if not found then
    raise exception using errcode='42501',message='POS_ACTOR_NOT_ACTIVE';
  end if;

  v_verified_at:=clock_timestamp();
  v_token:=encode(extensions.gen_random_bytes(32),'hex');
  v_issued_at:=clock_timestamp();
  v_expires_at:=v_issued_at+interval '5 minutes';

  return query
  insert into public.atomic_authorization_contexts as c(
    context_secret_hash,authenticated_user_id,tenant_id,branch_id,
    pos_profile_id,pos_verified_at,pos_verification_version,
    actor_role,authorization_source,purpose,idempotency_key_hash,
    context_version,issued_by_service,issuer_version,server_request_id,
    state,issued_at,expires_at
  ) values (
    encode(extensions.digest(v_token,'sha256'),'hex'),
    v_user_id,v_profile.tenant_id,v_pos_branch_id,v_pos_id,
    v_verified_at,'verify_pos_pin_for_actor-v1',
    v_pos_role,'pos_pin_server','create_order_atomic_v2',
    p_idempotency_key_hash,'atomic-auth-context-v1',
    'afex_context_issuer','issue-pos-context-v1',p_server_request_id,
    'issued',v_issued_at,v_expires_at
  )
  returning c.context_id,v_token,v_expires_at;
end;
$function$;

create or replace function public.revoke_atomic_authorization_context_v1(
  p_context_id uuid,
  p_reason_code text
)
returns boolean
language plpgsql volatile parallel unsafe security definer
set search_path=pg_catalog
as $function$
declare
  v_user_id uuid:=auth.uid();
  v_row public.atomic_authorization_contexts%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode='28000',message='AUTHENTICATION_REQUIRED';
  end if;
  if p_reason_code is null or length(p_reason_code) not between 1 and 128
     or p_reason_code !~ '^[A-Z0-9_]+$' then
    raise exception using errcode='22023',message='CONTEXT_SCOPE_INVALID';
  end if;
  select * into v_row
  from public.atomic_authorization_contexts c
  where c.context_id=p_context_id
  for update;
  if not found or v_row.authenticated_user_id<>v_user_id then
    raise exception using errcode='42501',
      message='CONTEXT_ISSUER_NOT_AUTHORIZED';
  end if;
  if v_row.state<>'issued' then
    raise exception using errcode='55000',message='CONTEXT_NOT_ISSUED';
  end if;
  update public.atomic_authorization_contexts
  set state='revoked',revoked_at=clock_timestamp(),
      revoked_by_user_id=v_user_id,revocation_reason_code=p_reason_code,
      updated_at=clock_timestamp()
  where context_id=p_context_id and state='issued';
  if not found then
    raise exception using errcode='40001',
      message='CONTEXT_CONSUMPTION_CONFLICT';
  end if;
  return true;
end;
$function$;

-- Internal only: Package 4 must call this inside the sale transaction.
create or replace function public.consume_atomic_authorization_context_v1(
  p_context_token text,
  p_expected_idempotency_key_hash text,
  p_correlation_id uuid
)
returns table(
  authorization_context_id uuid,
  actor_user_id uuid,
  tenant_id uuid,
  branch_id uuid,
  actor_role text,
  employee_id uuid,
  authorization_source text,
  correlation_id uuid
)
language plpgsql volatile parallel unsafe security definer
set search_path=pg_catalog
as $function$
begin
  /*
  Package 6B is the single source of token hashing, row locking, state,
  expiry, purpose/version, current profile/POS binding and transactional
  consumption. Additional internal columns are deliberately not exposed.
  Helper errors propagate unchanged.
  */
  return query
  select
    shared.authorization_context_id,
    shared.actor_user_id,
    shared.tenant_id,
    shared.branch_id,
    shared.actor_role,
    shared.employee_id,
    shared.authorization_source,
    shared.correlation_id
  from public.validate_atomic_authorization_context_internal_v1(
    p_context_token,
    'consuming_order',
    p_expected_idempotency_key_hash,
    p_correlation_id
  ) shared;
end;
$function$;

-- ===========================================================================
-- G. OUTBOX WORKER FUNCTIONS
-- ===========================================================================

create or replace function public.claim_atomic_outbox_events_v1(
  p_lease_owner text,
  p_batch_size integer default 25,
  p_lease_seconds integer default 60
)
returns table(
  id uuid,event_id uuid,tenant_id uuid,branch_id uuid,event_type text,
  aggregate_id uuid,aggregate_type text,payload_version text,payload jsonb,
  payload_hash text,correlation_id text,attempt_count integer
)
language plpgsql volatile parallel unsafe security definer
set search_path=pg_catalog
as $function$
begin
  if p_lease_owner is null or length(p_lease_owner) not between 16 and 128
     or p_lease_owner !~ '^[A-Za-z0-9._:-]+$'
     or p_batch_size not between 1 and 100
     or p_lease_seconds not between 15 and 300 then
    raise exception using errcode='22023',message='OUTBOX_CLAIM_INVALID';
  end if;
  return query
  with candidates as (
    select o.id
    from public.atomic_outbox o
    where (
      (o.execution_status in ('pending_commit','retryable')
       and o.next_attempt_at<=clock_timestamp())
      or
      (o.execution_status='processing'
       and o.lease_expires_at<=clock_timestamp())
    )
    order by o.next_attempt_at,o.created_at,o.id
    for update skip locked
    limit p_batch_size
  ),
  claimed as (
    update public.atomic_outbox o
    set execution_status='processing',lease_owner=p_lease_owner,
        lease_expires_at=clock_timestamp()
          + make_interval(secs=>p_lease_seconds),
        attempt_count=o.attempt_count+1,updated_at=clock_timestamp()
    from candidates c where o.id=c.id
    returning o.*
  )
  select c.id,c.event_id,c.tenant_id,c.branch_id,c.event_type,
    c.aggregate_id,c.aggregate_type,c.payload_version,c.payload,
    c.payload_hash,c.correlation_id,c.attempt_count
  from claimed c
  order by c.next_attempt_at,c.created_at,c.id;
end;
$function$;

create or replace function public.complete_atomic_outbox_event_v1(
  p_event_id uuid,
  p_lease_owner text
)
returns boolean
language plpgsql volatile parallel unsafe security definer
set search_path=pg_catalog
as $function$
begin
  if p_event_id is null or p_lease_owner is null
     or length(p_lease_owner) not between 16 and 128 then
    raise exception using errcode='22023',
      message='OUTBOX_COMPLETION_CONFLICT';
  end if;
  update public.atomic_outbox
  set execution_status='delivered',delivered_at=clock_timestamp(),
      lease_owner=null,lease_expires_at=null,last_error_code=null,
      last_error_classification=null,last_error_message=null,
      updated_at=clock_timestamp()
  where event_id=p_event_id and execution_status='processing'
    and lease_owner=p_lease_owner and lease_expires_at>clock_timestamp();
  if not found then
    raise exception using errcode='40001',
      message='OUTBOX_COMPLETION_CONFLICT';
  end if;
  return true;
end;
$function$;

create or replace function public.fail_atomic_outbox_event_v1(
  p_event_id uuid,
  p_lease_owner text,
  p_error_code text,
  p_error_classification text,
  p_error_message text
)
returns text
language plpgsql volatile parallel unsafe security definer
set search_path=pg_catalog
as $function$
declare
  v_row public.atomic_outbox%rowtype;
  v_status text;
  v_retry integer;
  v_delay_seconds integer;
begin
  if p_event_id is null or p_lease_owner is null
     or length(p_lease_owner) not between 16 and 128
     or p_error_code is null or length(p_error_code) not between 1 and 128
     or p_error_code !~ '^[A-Z0-9_]+$'
     or p_error_classification is null
     or length(p_error_classification) not between 1 and 128
     or p_error_message is null
     or length(p_error_message) not between 1 and 1000 then
    raise exception using errcode='22023',message='OUTBOX_FAILURE_INVALID';
  end if;
  select * into v_row from public.atomic_outbox o
  where o.event_id=p_event_id and o.execution_status='processing'
    and o.lease_owner=p_lease_owner
  for update;
  if not found then
    raise exception using errcode='40001',message='OUTBOX_LEASE_CONFLICT';
  end if;
  v_retry:=v_row.retry_count+1;
  v_status:=case when v_row.attempt_count>=8
    then 'dead_letter' else 'retryable' end;
  v_delay_seconds:=least(3600,30*(2^least(v_retry-1,7))::integer);
  update public.atomic_outbox
  set execution_status=v_status,retry_count=v_retry,
      next_attempt_at=case when v_status='retryable'
        then clock_timestamp()+make_interval(secs=>v_delay_seconds)
        else next_attempt_at end,
      lease_owner=null,lease_expires_at=null,
      last_error_code=p_error_code,
      last_error_classification=p_error_classification,
      last_error_message=p_error_message,updated_at=clock_timestamp()
  where id=v_row.id and execution_status='processing'
    and lease_owner=p_lease_owner;
  if not found then
    raise exception using errcode='40001',message='OUTBOX_LEASE_CONFLICT';
  end if;
  return v_status;
end;
$function$;

-- ===========================================================================
-- H. NEW FUNCTION OWNERSHIP AND EXECUTION MATRIX
-- ===========================================================================

alter function public.issue_atomic_authorization_context_v1(uuid,text,text)
  owner to afex_context_issuer;
alter function public.issue_pos_atomic_authorization_context_v1(
  text,uuid,text,text
) owner to afex_context_issuer;
alter function public.revoke_atomic_authorization_context_v1(uuid,text)
  owner to afex_context_issuer;
alter function public.consume_atomic_authorization_context_v1(text,text,uuid)
  owner to afex_core_owner;
alter function public.claim_atomic_outbox_events_v1(text,integer,integer)
  owner to afex_core_owner;
alter function public.complete_atomic_outbox_event_v1(uuid,text)
  owner to afex_core_owner;
alter function public.fail_atomic_outbox_event_v1(
  uuid,text,text,text,text
) owner to afex_core_owner;

revoke execute on function
  public.issue_atomic_authorization_context_v1(uuid,text,text),
  public.issue_pos_atomic_authorization_context_v1(text,uuid,text,text),
  public.revoke_atomic_authorization_context_v1(uuid,text),
  public.consume_atomic_authorization_context_v1(text,text,uuid),
  public.claim_atomic_outbox_events_v1(text,integer,integer),
  public.complete_atomic_outbox_event_v1(uuid,text),
  public.fail_atomic_outbox_event_v1(uuid,text,text,text,text)
from public,anon,authenticated,service_role,afex_context_issuer,
  afex_outbox_worker;

grant execute on function
  public.claim_atomic_outbox_events_v1(text,integer,integer),
  public.complete_atomic_outbox_event_v1(uuid,text),
  public.fail_atomic_outbox_event_v1(uuid,text,text,text,text)
to afex_outbox_worker;

-- Deliberately absent:
-- * no runtime grant on create_order_atomic_v2;
-- * no runtime grant on either context issuer or revoker;
-- * no direct table grant to afex_outbox_worker;
-- * no financial quote INSERT grant or payload-trusting quote issuer.

commit;

-- 5R-B read-only delegation proof. Every boolean must be true.
with consumer as (
  select pg_get_functiondef(
    'public.consume_atomic_authorization_context_v1(text,text,uuid)'
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
  )=1 as shared_validator_called_once,
  body like '%''consuming_order''%' as consuming_mode_exact,
  body not like '%extensions.digest(%' as no_duplicate_token_hashing,
  body not like '%from public.atomic_authorization_contexts%'
    as no_duplicate_context_lookup,
  body not like '%update public.atomic_authorization_contexts%'
    as no_duplicate_consumption_update,
  body not like '%when others%' as helper_errors_propagate,
  pg_get_function_result(
    'public.consume_atomic_authorization_context_v1(text,text,uuid)'
      ::regprocedure
  )=
    'TABLE(authorization_context_id uuid, actor_user_id uuid, '
    || 'tenant_id uuid, branch_id uuid, actor_role text, employee_id uuid, '
    || 'authorization_source text, correlation_id uuid)'
    as consumer_return_shape_preserved
from consumer;

with roles(role_name) as (values
  ('PUBLIC'),('anon'),('authenticated'),('service_role'),
  ('afex_core_runtime'),('afex_context_issuer'),('afex_outbox_worker'),
  ('afex_core_activation_operator')
),
functions(signature) as (values
  ('public.consume_atomic_authorization_context_v1(text,text,uuid)'),
  ('public.validate_atomic_authorization_context_internal_v1(text,text,text,uuid)')
)
select
  role_name,
  signature,
  not has_function_privilege(role_name,signature,'EXECUTE')
    as execute_closed
from roles cross join functions
order by role_name,signature;

-- ===========================================================================
-- I. READ-ONLY LEGACY ACL/POLICY DIAGNOSTICS
-- ===========================================================================

select
  n.nspname as schema_name,c.relname as object_name,c.relkind,
  x.grantee,x.privilege_type,x.is_grantable
from information_schema.role_table_grants x
join pg_namespace n on n.nspname=x.table_schema
join pg_class c on c.relnamespace=n.oid and c.relname=x.table_name
where x.table_schema='public'
  and x.grantee in ('PUBLIC','anon','authenticated','service_role')
  and x.table_name in (
    'customers','orders','invoices','invoice_items','inventory_stock',
    'inventory_movements','audit_logs','order_number_sequences',
    'catalog_items','branch_catalog_items','discounts','vat_settings',
    'financial_quotes','idempotency_commands','atomic_outbox',
    'atomic_authorization_contexts'
  )
order by object_name,grantee,privilege_type;

select
  schemaname,tablename,policyname,permissive,roles,cmd,
  qual is null as unrestricted_using,
  with_check is null as unrestricted_check
from pg_policies
where schemaname='public'
  and tablename in (
    'customers','orders','invoices','invoice_items','inventory_stock',
    'inventory_movements','audit_logs','order_number_sequences',
    'catalog_items','branch_catalog_items','discounts','vat_settings',
    'financial_quotes','idempotency_commands','atomic_outbox',
    'atomic_authorization_contexts'
  )
order by tablename,policyname;

select
  r.rolname,t.table_name,
  has_table_privilege(r.rolname,'public.'||quote_ident(t.table_name),'SELECT')
    as can_select,
  has_table_privilege(r.rolname,'public.'||quote_ident(t.table_name),'INSERT')
    as can_insert,
  has_table_privilege(r.rolname,'public.'||quote_ident(t.table_name),'UPDATE')
    as can_update,
  has_table_privilege(r.rolname,'public.'||quote_ident(t.table_name),'DELETE')
    as can_delete
from pg_roles r
cross join (values
  ('customers'),('orders'),('invoices'),('invoice_items'),
  ('inventory_stock'),('inventory_movements'),('audit_logs'),
  ('order_number_sequences'),('financial_quotes'),
  ('idempotency_commands'),('atomic_outbox'),
  ('atomic_authorization_contexts')
) t(table_name)
where r.rolname in ('anon','authenticated','service_role')
order by r.rolname,t.table_name;

-- Package 6 must remove every remaining runtime INSERT/UPDATE/DELETE shown
-- above on legacy business tables before Core V2 becomes authoritative.

-- ===========================================================================
-- J. READ-ONLY EFFECTIVE-PRIVILEGE VERIFICATION
-- ===========================================================================

with functions(signature) as (values
  ('public.resolve_atomic_authorization_v2(jsonb,jsonb)'),
  ('public.normalize_customer_phone_v2(text)'),
  ('public.resolve_customer_identity_v2(uuid,uuid,uuid,jsonb)'),
  ('public.resolve_customer_identity_result_v2(uuid,uuid,uuid,jsonb)'),
  ('public.build_atomic_request_fingerprint_v2(jsonb,jsonb)'),
  ('public.acquire_idempotency_command_v2(uuid,uuid,text,text,text,uuid,uuid,text,uuid)'),
  ('public.build_atomic_order_response_v1(uuid,uuid)'),
  ('public.allocate_branch_monthly_number_v2(uuid,uuid,date)'),
  ('public.assert_atomic_legacy_triggers_safe_v2()'),
  ('public.resolve_inventory_requirements_v2(uuid,uuid,jsonb)'),
  ('public.lock_and_validate_inventory_v2(uuid,uuid,jsonb)'),
  ('public.build_inventory_movement_evidence_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,numeric,numeric,numeric,bigint,bigint)'),
  ('public.apply_inventory_mutations_v2(uuid,uuid,uuid,uuid,uuid,uuid,jsonb,jsonb)'),
  ('public.atomic_semantic_event_uuid_v1(text)'),
  ('public.enqueue_atomic_outbox_v2(uuid,uuid,uuid,uuid,uuid,boolean,text,text,numeric,text,text,text,jsonb,uuid,timestamp with time zone)'),
  ('public.derive_atomic_financial_snapshot_v2(uuid,uuid,jsonb)'),
  ('public.create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)'),
  ('public.issue_atomic_authorization_context_v1(uuid,text,text)'),
  ('public.issue_pos_atomic_authorization_context_v1(text,uuid,text,text)'),
  ('public.revoke_atomic_authorization_context_v1(uuid,text)'),
  ('public.consume_atomic_authorization_context_v1(text,text,uuid)'),
  ('public.validate_atomic_authorization_context_internal_v1(text,text,text,uuid)'),
  ('public.claim_atomic_outbox_events_v1(text,integer,integer)'),
  ('public.complete_atomic_outbox_event_v1(uuid,text)'),
  ('public.fail_atomic_outbox_event_v1(uuid,text,text,text,text)')
),
roles(role_name) as (values
  ('PUBLIC'),('anon'),('authenticated'),('service_role'),
  ('afex_core_runtime'),('afex_context_issuer'),('afex_outbox_worker'),
  ('afex_core_activation_operator')
)
select role_name,signature,
  has_function_privilege(role_name,signature,'EXECUTE') as can_execute
from roles cross join functions
order by role_name,signature;

select rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolinherit,
  rolreplication,rolbypassrls
from pg_roles
where rolname in (
  'afex_core_owner','afex_context_issuer','afex_outbox_worker'
)
order by rolname;

select n.nspname,c.relname,c.relowner::regrole as object_owner,c.relrowsecurity,
  c.relforcerowsecurity
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in (
    'atomic_authorization_contexts','financial_quotes',
    'idempotency_commands','atomic_outbox'
  )
order by c.relname;

select p.oid::regprocedure as function_signature,
  p.proowner::regrole as function_owner,p.prosecdef,
  p.proconfig
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'resolve_atomic_authorization_v2','normalize_customer_phone_v2',
    'resolve_customer_identity_v2','resolve_customer_identity_result_v2',
    'build_atomic_request_fingerprint_v2',
    'acquire_idempotency_command_v2','build_atomic_order_response_v1',
    'allocate_branch_monthly_number_v2',
    'assert_atomic_legacy_triggers_safe_v2',
    'resolve_inventory_requirements_v2',
    'lock_and_validate_inventory_v2',
    'build_inventory_movement_evidence_v2',
    'apply_inventory_mutations_v2','atomic_semantic_event_uuid_v1',
    'enqueue_atomic_outbox_v2','derive_atomic_financial_snapshot_v2',
    'create_order_atomic_v2','issue_atomic_authorization_context_v1',
    'issue_pos_atomic_authorization_context_v1',
    'revoke_atomic_authorization_context_v1',
    'consume_atomic_authorization_context_v1',
    'validate_atomic_authorization_context_internal_v1',
    'claim_atomic_outbox_events_v1',
    'complete_atomic_outbox_event_v1',
    'fail_atomic_outbox_event_v1'
  )
order by function_signature::text;

select member_role.rolname as member,granted_role.rolname as granted_role,
  m.admin_option
from pg_auth_members m
join pg_roles member_role on member_role.oid=m.member
join pg_roles granted_role on granted_role.oid=m.roleid
where member_role.rolname in (
  'anon','authenticated','service_role',
  'afex_core_owner','afex_context_issuer','afex_outbox_worker'
)
or granted_role.rolname in (
  'afex_core_owner','afex_context_issuer','afex_outbox_worker'
)
order by member,granted_role;

select rolname,
  has_schema_privilege(rolname,'public','CREATE') as can_create_public,
  has_schema_privilege(rolname,'public','USAGE') as can_use_public
from pg_roles
where rolname in (
  'anon','authenticated','service_role','afex_core_owner',
  'afex_context_issuer','afex_outbox_worker'
)
order by rolname;

select defaclrole::regrole as grantor,
  coalesce(n.nspname,'*') as schema_name,defaclobjtype,defaclacl
from pg_default_acl d
left join pg_namespace n on n.oid=d.defaclnamespace
where coalesce(n.nspname,'public')='public'
order by grantor::text,defaclobjtype;

/*
MANUAL EXECUTION ORDER
  1. Verify dependency hashes externally.
  2. Run preflight; stop on any signature/role drift.
  3. Create and validate roles.
  4. Harden schema/default privileges.
  5. Transfer exact Package 4 function ownership and revoke execution.
  6. Apply minimal owner rights, internal revokes and narrow RLS policies.
  7. Create issuer/revoker/consumer and worker functions.
  8. Transfer their ownership; revoke all; grant worker functions only.
  9. Commit.
 10. Run diagnostics and effective-privilege queries.

CONSERVATIVE ROLLBACK ORDER
  1. Do not restore browser/service direct internal-table access.
  2. Revoke worker EXECUTE.
  3. Revoke all runtime EXECUTE on Package 4/5R functions.
  4. Keep RLS, direct-write revocations, and default-privilege hardening.
  5. Application rollback continues through the unchanged legacy route.
  6. Drop new functions/roles only in a separately reviewed cleanup after
     proving no dependencies. Do not transfer Package 4 ownership back
     casually.

PACKAGE 4T SYNCHRONIZATION
  Package 4T hash:
  40900e9e2bed32ef1f3064881081892719037924d19dfb9a6ff37f5d2feecfe7
  Its consumer signature and return mapping remain unchanged. A parity failure
  after shared consuming validation rolls the context state update back with
  the caller transaction. Committed replay still requires a new trusted
  context and returns before quote/current-financial validation.

PACKAGE 6A-A HANDOFF
  Update Package 4 and Package 5 dependency hashes. Replace
  validate_atomic_authorization_context_for_quote_v1(text) body with a thin
  non_consuming_quote delegate to the same Package 6B helper. Extend readiness
  V2 to recognize Package 4T parity and Package 6B quote gates without changing
  activation behavior or granting either issuer/atomic entry point.

PACKAGE 6 HASH HANDOFF
  Update only the Package 4/Package 5 dependency metadata after external
  approval. Preserve all disabled feature state and runtime privilege gates.
*/
