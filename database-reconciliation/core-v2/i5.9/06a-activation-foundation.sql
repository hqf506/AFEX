/*
AFEX Core V2 I5.9 - Package 6A
Server-Authoritative Activation Metadata, Canary Control, Package 7 Evidence,
Runtime Identity Contract and Disabled-State Foundation

STATIC / ADDITIVE FOUNDATION ONLY
---------------------------------
This package creates fail-closed metadata, evidence, validation and operator
contracts. It does not activate Core V2, grant create_order_atomic_v2, grant
either authorization-context issuer, disable a legacy route or trigger, create
credentials, or implement a caller-trusting financial quote issuer.

Approved external dependency hashes (operator-attested outside PostgreSQL):
  Package 2B-S
    009395af590b53c39a33004c3ad63d1e28a176291d5cfbaa6feb9b71329e591d
  Package 4T
    40900e9e2bed32ef1f3064881081892719037924d19dfb9a6ff37f5d2feecfe7
  Package 5R-B
    df141eb3ad7c1ff9b9a2ca700a06b4493c524d671b384cf2c4d6a61b0fb569a3
  Package 7 Test Harness (approved for external review; NOT EXECUTED)
    0bae4a65e24a0a5aa91ed16538937725d1e154d126ef5862029efb4db6d954fd

External hashes are recorded as evidence; PostgreSQL does not read repository
files and therefore cannot independently prove those hashes.
The Package 7 harness hash is documentation only and never substitutes for
runtime Package 7 PASS evidence.
*/

-- ===========================================================================
-- A. DEPENDENCY AND ROLE PREFLIGHT
-- ===========================================================================

do $package6a_preflight$
declare
  v_missing text;
  v_unexpected text;
  v_role_name text;
  v_role pg_roles%rowtype;
begin
  with expected(signature) as (values
    ('create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)'),
    ('issue_atomic_authorization_context_v1(uuid,text,text)'),
    ('issue_pos_atomic_authorization_context_v1(text,uuid,text,text)'),
    ('consume_atomic_authorization_context_v1(text,text,uuid)'),
    ('verify_core_v2_activation_readiness_v1()'),
    ('claim_atomic_outbox_events_v1(text,integer,integer)'),
    ('complete_atomic_outbox_event_v1(uuid,text)'),
    ('fail_atomic_outbox_event_v1(uuid,text,text,text,text)')
  )
  select string_agg(signature, ', ' order by signature)
  into v_missing
  from expected
  where to_regprocedure('public.' || signature) is null;

  if v_missing is not null then
    raise exception using
      errcode = '55000',
      message = 'PACKAGE6A_REQUIRED_SIGNATURE_MISSING',
      detail = v_missing;
  end if;

  with expected(proname, identity_args) as (values
    ('create_order_atomic_v2','jsonb, jsonb, jsonb, jsonb'),
    ('issue_atomic_authorization_context_v1','uuid, text, text'),
    ('issue_pos_atomic_authorization_context_v1','text, uuid, text, text'),
    ('consume_atomic_authorization_context_v1','text, text, uuid'),
    ('verify_core_v2_activation_readiness_v1',''),
    ('claim_atomic_outbox_events_v1','text, integer, integer'),
    ('complete_atomic_outbox_event_v1','uuid, text'),
    ('fail_atomic_outbox_event_v1','uuid, text, text, text, text')
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
      message = 'PACKAGE6A_UNEXPECTED_OVERLOAD',
      detail = v_unexpected;
  end if;

  foreach v_role_name in array array[
    'afex_core_owner',
    'afex_context_issuer',
    'afex_outbox_worker',
    'afex_core_runtime'
  ]
  loop
    select * into v_role
    from pg_roles
    where rolname = v_role_name;

    if not found then
      raise exception using
        errcode = '55000',
        message = 'PACKAGE6A_REQUIRED_ROLE_MISSING',
        detail = v_role_name;
    end if;

    if v_role.rolcanlogin
       or v_role.rolsuper
       or v_role.rolcreatedb
       or v_role.rolcreaterole
       or v_role.rolinherit
       or v_role.rolreplication
       or v_role.rolbypassrls then
      raise exception using
        errcode = '55000',
        message = 'PACKAGE6A_ROLE_ATTRIBUTE_DRIFT',
        detail = v_role_name;
    end if;
  end loop;
end;
$package6a_preflight$;

begin;

-- ===========================================================================
-- B. DEDICATED NOLOGIN OWNERSHIP / OPERATOR ROLES
-- ===========================================================================

do $package6a_roles$
declare
  v_name text;
  v_role pg_roles%rowtype;
begin
  if not exists (
    select 1 from pg_roles where rolname = 'afex_core_activation_owner'
  ) then
    create role afex_core_activation_owner
      nologin nosuperuser nocreatedb nocreaterole noinherit
      noreplication nobypassrls;
  end if;

  if not exists (
    select 1 from pg_roles where rolname = 'afex_core_activation_operator'
  ) then
    create role afex_core_activation_operator
      nologin nosuperuser nocreatedb nocreaterole noinherit
      noreplication nobypassrls;
  end if;

  foreach v_name in array array[
    'afex_core_activation_owner',
    'afex_core_activation_operator'
  ]
  loop
    select * into strict v_role from pg_roles where rolname = v_name;
    if v_role.rolcanlogin
       or v_role.rolsuper
       or v_role.rolcreatedb
       or v_role.rolcreaterole
       or v_role.rolinherit
       or v_role.rolreplication
       or v_role.rolbypassrls then
      raise exception using
        errcode = '55000',
        message = 'PACKAGE6A_ROLE_UNSAFE',
        detail = v_name;
    end if;
  end loop;

  if exists (
    select 1
    from pg_auth_members m
    join pg_roles member_role on member_role.oid = m.member
    join pg_roles granted_role on granted_role.oid = m.roleid
    where (
      granted_role.rolname in (
        'afex_core_activation_owner',
        'afex_core_activation_operator'
      )
    )
    or (
      member_role.rolname in (
        'afex_core_activation_owner',
        'afex_core_activation_operator'
      )
      and granted_role.rolname in (
        'afex_core_owner','afex_context_issuer','afex_core_runtime',
        'afex_outbox_worker'
      )
    )
  ) then
    raise exception using
      errcode = '55000',
      message = 'PACKAGE6A_ROLE_MEMBERSHIP_UNSAFE';
  end if;
end;
$package6a_roles$;

revoke all on schema public
from afex_core_activation_owner, afex_core_activation_operator;
grant usage on schema public
to afex_core_activation_owner, afex_core_activation_operator;

-- ===========================================================================
-- C. FAIL-CLOSED ACTIVATION AND ALLOWLIST TABLES
-- ===========================================================================

create table public.core_v2_activation_control (
  singleton_id boolean
    primary key
    default true
    constraint ck_core_v2_activation_control_singleton check (singleton_id),
  global_enabled boolean not null default false,
  kill_switch boolean not null default true,
  pos_enabled boolean not null default false,
  admin_orders_enabled boolean not null default false,
  quote_issuer_enabled boolean not null default false,
  outbox_worker_enabled boolean not null default false,
  deterministic_canary_percentage integer not null default 0,
  canary_algorithm_version text not null default 'sha256-mod100-v1',
  canary_seed text not null default 'UNCONFIGURED',
  activation_version text not null default 'core-v2-i5.9-disabled',
  environment text not null default 'production',
  current_change_ticket text,
  activated_at timestamptz,
  activated_by uuid,
  deactivated_at timestamptz not null default clock_timestamp(),
  deactivated_by uuid,
  updated_at timestamptz not null default clock_timestamp(),
  record_version bigint not null default 1,
  constraint ck_core_v2_activation_control_percentage
    check (deterministic_canary_percentage between 0 and 100),
  constraint ck_core_v2_activation_control_algorithm
    check (canary_algorithm_version = 'sha256-mod100-v1'),
  constraint ck_core_v2_activation_control_environment
    check (environment in ('development','staging','production')),
  constraint ck_core_v2_activation_control_seed
    check (length(canary_seed) between 8 and 128),
  constraint ck_core_v2_activation_control_version
    check (
      length(btrim(activation_version)) between 1 and 128
      and record_version > 0
    ),
  constraint ck_core_v2_activation_control_ticket
    check (
      current_change_ticket is null
      or length(btrim(current_change_ticket)) between 3 and 128
    ),
  constraint ck_core_v2_activation_control_global_safety
    check (not global_enabled or not kill_switch),
  constraint ck_core_v2_activation_control_disabled_consistency
    check (
      global_enabled
      or (
        not pos_enabled
        and not admin_orders_enabled
        and not quote_issuer_enabled
        and not outbox_worker_enabled
        and deterministic_canary_percentage = 0
      )
    ),
  constraint ck_core_v2_activation_control_activation_evidence
    check (
      (
        global_enabled
        and activated_at is not null
        and activated_by is not null
        and current_change_ticket is not null
      )
      or not global_enabled
    ),
  constraint fk_core_v2_activation_control_activated_by
    foreign key (activated_by) references public.profiles(id)
    on update no action on delete no action,
  constraint fk_core_v2_activation_control_deactivated_by
    foreign key (deactivated_by) references public.profiles(id)
    on update no action on delete no action
);

create table public.core_v2_tenant_activation (
  tenant_id uuid primary key,
  enabled boolean not null default false,
  canary_eligible boolean not null default false,
  pos_enabled boolean not null default false,
  admin_orders_enabled boolean not null default false,
  quote_enabled boolean not null default false,
  activation_version text not null,
  change_ticket text not null,
  approved_by uuid not null,
  approved_at timestamptz not null,
  disabled_at timestamptz,
  disabled_reason text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  record_version bigint not null default 1,
  constraint ck_core_v2_tenant_activation_text
    check (
      length(btrim(activation_version)) between 1 and 128
      and length(btrim(change_ticket)) between 3 and 128
      and record_version > 0
    ),
  constraint ck_core_v2_tenant_activation_features
    check (
      enabled
      or (
        not canary_eligible
        and not pos_enabled
        and not admin_orders_enabled
        and not quote_enabled
      )
    ),
  constraint ck_core_v2_tenant_activation_disabled
    check (
      (enabled and disabled_at is null and disabled_reason is null)
      or
      (
        not enabled
        and disabled_at is not null
        and disabled_reason is not null
        and length(btrim(disabled_reason)) between 3 and 500
      )
    ),
  constraint fk_core_v2_tenant_activation_tenant
    foreign key (tenant_id) references public.tenants(id)
    on update no action on delete no action,
  constraint fk_core_v2_tenant_activation_approved_by
    foreign key (tenant_id, approved_by)
    references public.profiles(tenant_id, id)
    on update no action on delete no action
);

create table public.core_v2_branch_activation (
  tenant_id uuid not null,
  branch_id uuid not null,
  enabled boolean not null default false,
  canary_eligible boolean not null default false,
  pos_enabled boolean not null default false,
  admin_orders_enabled boolean not null default false,
  quote_enabled boolean not null default false,
  activation_version text not null,
  change_ticket text not null,
  approved_by uuid not null,
  approved_at timestamptz not null,
  disabled_at timestamptz,
  disabled_reason text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  record_version bigint not null default 1,
  constraint pk_core_v2_branch_activation primary key (tenant_id, branch_id),
  constraint ck_core_v2_branch_activation_text
    check (
      length(btrim(activation_version)) between 1 and 128
      and length(btrim(change_ticket)) between 3 and 128
      and record_version > 0
    ),
  constraint ck_core_v2_branch_activation_features
    check (
      enabled
      or (
        not canary_eligible
        and not pos_enabled
        and not admin_orders_enabled
        and not quote_enabled
      )
    ),
  constraint ck_core_v2_branch_activation_disabled
    check (
      (enabled and disabled_at is null and disabled_reason is null)
      or
      (
        not enabled
        and disabled_at is not null
        and disabled_reason is not null
        and length(btrim(disabled_reason)) between 3 and 500
      )
    ),
  constraint fk_core_v2_branch_activation_tenant_activation
    foreign key (tenant_id)
    references public.core_v2_tenant_activation(tenant_id)
    on update no action on delete no action,
  constraint fk_core_v2_branch_activation_branch_scope
    foreign key (tenant_id, branch_id)
    references public.branches(tenant_id, id)
    on update no action on delete no action,
  constraint fk_core_v2_branch_activation_approved_by
    foreign key (tenant_id, approved_by)
    references public.profiles(tenant_id, id)
    on update no action on delete no action
);

create index idx_core_v2_tenant_activation_enabled
  on public.core_v2_tenant_activation (enabled, tenant_id);
create index idx_core_v2_branch_activation_enabled
  on public.core_v2_branch_activation (enabled, tenant_id, branch_id);

-- The only seed is explicitly disabled and fail-closed.
insert into public.core_v2_activation_control (
  singleton_id,
  global_enabled,
  kill_switch,
  pos_enabled,
  admin_orders_enabled,
  quote_issuer_enabled,
  outbox_worker_enabled,
  deterministic_canary_percentage,
  canary_algorithm_version,
  canary_seed,
  activation_version,
  environment,
  current_change_ticket
) values (
  true,
  false,
  true,
  false,
  false,
  false,
  false,
  0,
  'sha256-mod100-v1',
  'UNCONFIGURED',
  'core-v2-i5.9-disabled',
  'production',
  null
);

-- ===========================================================================
-- D. IMMUTABLE PACKAGE 7 EVIDENCE
-- ===========================================================================

create table public.core_v2_verification_evidence (
  evidence_id uuid primary key default gen_random_uuid(),
  package_version text not null,
  environment text not null,
  tenant_id uuid,
  branch_id uuid,
  test_suite_identifier text not null,
  test_run_identifier text not null,
  artifact_hash text not null,
  result text not null,
  started_at timestamptz not null,
  completed_at timestamptz not null,
  recorded_at timestamptz not null default clock_timestamp(),
  recorded_by uuid not null,
  change_ticket text not null,
  result_summary text not null,
  supersedes_evidence_id uuid,
  constraint uq_core_v2_verification_evidence_run
    unique (
      package_version,
      environment,
      test_suite_identifier,
      test_run_identifier
    ),
  constraint ck_core_v2_verification_evidence_environment
    check (environment in ('development','staging','production')),
  constraint ck_core_v2_verification_evidence_result
    check (result in ('PASS','FAIL')),
  constraint ck_core_v2_verification_evidence_hash
    check (artifact_hash ~ '^[0-9a-f]{64}$'),
  constraint ck_core_v2_verification_evidence_text
    check (
      length(btrim(package_version)) between 1 and 128
      and length(btrim(test_suite_identifier)) between 1 and 128
      and length(btrim(test_run_identifier)) between 1 and 128
      and length(btrim(change_ticket)) between 3 and 128
      and length(btrim(result_summary)) between 1 and 1000
    ),
  constraint ck_core_v2_verification_evidence_time
    check (
      completed_at >= started_at
      and recorded_at >= started_at
    ),
  constraint ck_core_v2_verification_evidence_scope
    check (branch_id is null or tenant_id is not null),
  constraint fk_core_v2_verification_evidence_tenant
    foreign key (tenant_id) references public.tenants(id)
    on update no action on delete no action,
  constraint fk_core_v2_verification_evidence_branch_scope
    foreign key (tenant_id, branch_id)
    references public.branches(tenant_id, id)
    on update no action on delete no action,
  constraint fk_core_v2_verification_evidence_recorded_by
    foreign key (recorded_by) references public.profiles(id)
    on update no action on delete no action,
  constraint fk_core_v2_verification_evidence_supersedes
    foreign key (supersedes_evidence_id)
    references public.core_v2_verification_evidence(evidence_id)
    on update no action on delete no action
);

create index idx_core_v2_evidence_readiness
  on public.core_v2_verification_evidence (
    package_version,
    environment,
    test_suite_identifier,
    result,
    tenant_id,
    branch_id,
    completed_at desc
  );

-- ===========================================================================
-- E. MANAGED IDENTITY REGISTRATION METADATA (NO CREDENTIALS)
-- ===========================================================================

create table public.core_v2_managed_identities (
  identity_id uuid primary key default gen_random_uuid(),
  database_role_name name not null,
  identity_kind text not null,
  purpose text not null,
  active boolean not null default false,
  owner_team text not null,
  environment text not null,
  approved_at timestamptz,
  approved_by uuid,
  approval_change_ticket text,
  last_verified_at timestamptz,
  expected_membership_role name not null,
  secret_reference_label text not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  record_version bigint not null default 1,
  constraint uq_core_v2_managed_identity
    unique (environment, database_role_name),
  constraint ck_core_v2_managed_identity_kind
    check (identity_kind in ('runtime','outbox_worker','operator')),
  constraint ck_core_v2_managed_identity_environment
    check (environment in ('development','staging','production')),
  constraint ck_core_v2_managed_identity_role_exclusions
    check (
      database_role_name::text not in (
        'PUBLIC','anon','authenticated','service_role',
        'afex_core_owner','afex_context_issuer','afex_core_runtime',
        'afex_outbox_worker','afex_core_activation_owner',
        'afex_core_activation_operator'
      )
    ),
  constraint ck_core_v2_managed_identity_expected_membership
    check (
      (identity_kind = 'runtime'
        and expected_membership_role = 'afex_core_runtime'::name)
      or
      (identity_kind = 'outbox_worker'
        and expected_membership_role = 'afex_outbox_worker'::name)
      or
      (identity_kind = 'operator'
        and expected_membership_role = 'afex_core_activation_operator'::name)
    ),
  constraint ck_core_v2_managed_identity_text
    check (
      length(btrim(purpose)) between 3 and 500
      and length(btrim(owner_team)) between 2 and 128
      and length(btrim(secret_reference_label)) between 3 and 256
      and secret_reference_label !~* '(password|token|secret)\\s*='
      and record_version > 0
    ),
  constraint ck_core_v2_managed_identity_approval
    check (
      (
        active
        and approved_at is not null
        and approved_by is not null
        and approval_change_ticket is not null
        and length(btrim(approval_change_ticket)) between 3 and 128
        and last_verified_at is not null
      )
      or not active
    ),
  constraint fk_core_v2_managed_identity_approved_by
    foreign key (approved_by) references public.profiles(id)
    on update no action on delete no action
);

create index idx_core_v2_managed_identity_active
  on public.core_v2_managed_identities (
    environment, identity_kind, active
  );

-- ===========================================================================
-- F. ISSUER RATE-LIMIT CONFIGURATION AND WINDOW EVIDENCE
-- ===========================================================================

create table public.core_v2_issuer_rate_limit_config (
  issuer_kind text primary key,
  enabled boolean not null default true,
  window_seconds integer not null,
  maximum_attempts integer not null,
  retention_seconds integer not null,
  configuration_version text not null,
  updated_at timestamptz not null default clock_timestamp(),
  record_version bigint not null default 1,
  constraint ck_core_v2_issuer_rate_limit_kind
    check (issuer_kind in ('authenticated_context','pos_pin_context')),
  constraint ck_core_v2_issuer_rate_limit_bounds
    check (
      window_seconds between 10 and 3600
      and maximum_attempts between 1 and 100
      and retention_seconds between window_seconds and 2592000
      and record_version > 0
      and length(btrim(configuration_version)) between 1 and 128
    )
);

create table public.core_v2_issuer_rate_limit_windows (
  issuer_kind text not null,
  authenticated_user_id uuid not null,
  tenant_id uuid not null,
  branch_id uuid not null,
  subject_scope_hash text not null,
  window_started_at timestamptz not null,
  attempt_count integer not null default 0,
  successful_attempt_count integer not null default 0,
  failed_attempt_count integer not null default 0,
  last_attempt_at timestamptz not null,
  expires_at timestamptz not null,
  constraint pk_core_v2_issuer_rate_limit_windows primary key (
    issuer_kind,
    authenticated_user_id,
    tenant_id,
    branch_id,
    subject_scope_hash,
    window_started_at
  ),
  constraint ck_core_v2_issuer_rate_limit_window_kind
    check (issuer_kind in ('authenticated_context','pos_pin_context')),
  constraint ck_core_v2_issuer_rate_limit_scope_hash
    check (subject_scope_hash ~ '^[0-9a-f]{64}$'),
  constraint ck_core_v2_issuer_rate_limit_counts
    check (
      attempt_count > 0
      and successful_attempt_count >= 0
      and failed_attempt_count >= 0
      and successful_attempt_count + failed_attempt_count = attempt_count
    ),
  constraint ck_core_v2_issuer_rate_limit_times
    check (
      last_attempt_at >= window_started_at
      and expires_at > window_started_at
    ),
  constraint fk_core_v2_issuer_rate_limit_config
    foreign key (issuer_kind)
    references public.core_v2_issuer_rate_limit_config(issuer_kind)
    on update no action on delete no action,
  constraint fk_core_v2_issuer_rate_limit_profile_scope
    foreign key (tenant_id, authenticated_user_id)
    references public.profiles(tenant_id, id)
    on update no action on delete no action,
  constraint fk_core_v2_issuer_rate_limit_branch_scope
    foreign key (tenant_id, branch_id)
    references public.branches(tenant_id, id)
    on update no action on delete no action
);

create index idx_core_v2_issuer_rate_limit_expiry
  on public.core_v2_issuer_rate_limit_windows (expires_at);

insert into public.core_v2_issuer_rate_limit_config (
  issuer_kind,
  enabled,
  window_seconds,
  maximum_attempts,
  retention_seconds,
  configuration_version
) values
  ('authenticated_context', true, 300, 30, 604800, 'issuer-rate-limit-v1'),
  ('pos_pin_context', true, 300, 10, 604800, 'issuer-rate-limit-v1');

-- ===========================================================================
-- G. COMMON IMMUTABILITY / ROW-VERSION TRIGGERS
-- ===========================================================================

create function public.reject_core_v2_immutable_change_v1()
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
    message = 'CORE_V2_IMMUTABLE_EVIDENCE';
end;
$function$;

create trigger trg_core_v2_verification_evidence_immutable
before update or delete on public.core_v2_verification_evidence
for each row execute function public.reject_core_v2_immutable_change_v1();

create function public.touch_core_v2_control_row_v1()
returns trigger
language plpgsql
volatile
parallel unsafe
security invoker
set search_path = pg_catalog
as $function$
begin
  new.updated_at := clock_timestamp();
  new.record_version := old.record_version + 1;
  return new;
end;
$function$;

create trigger trg_touch_core_v2_activation_control
before update on public.core_v2_activation_control
for each row execute function public.touch_core_v2_control_row_v1();
create trigger trg_touch_core_v2_tenant_activation
before update on public.core_v2_tenant_activation
for each row execute function public.touch_core_v2_control_row_v1();
create trigger trg_touch_core_v2_branch_activation
before update on public.core_v2_branch_activation
for each row execute function public.touch_core_v2_control_row_v1();
create trigger trg_touch_core_v2_managed_identities
before update on public.core_v2_managed_identities
for each row execute function public.touch_core_v2_control_row_v1();
create trigger trg_touch_core_v2_rate_limit_config
before update on public.core_v2_issuer_rate_limit_config
for each row execute function public.touch_core_v2_control_row_v1();

-- ===========================================================================
-- H. DETERMINISTIC, SERVER-AUTHORITATIVE CANARY DECISION
-- ===========================================================================

create function public.is_core_v2_request_enabled_v1(
  p_tenant_id uuid,
  p_branch_id uuid,
  p_stable_command_identity text,
  p_feature text
)
returns table(
  enabled boolean,
  decision_reason text,
  activation_version text,
  canary_bucket integer
)
language plpgsql
stable
parallel safe
security definer
set search_path = pg_catalog
as $function$
declare
  v_control public.core_v2_activation_control%rowtype;
  v_tenant public.core_v2_tenant_activation%rowtype;
  v_branch public.core_v2_branch_activation%rowtype;
  v_digest text;
  v_bucket integer;
  v_feature_global boolean;
  v_feature_tenant boolean;
  v_feature_branch boolean;
begin
  if p_tenant_id is null
     or p_stable_command_identity is null
     or length(p_stable_command_identity) not between 16 and 256
     or p_feature not in ('pos','admin_orders','quote','outbox_worker') then
    return query select false, 'INVALID_DECISION_INPUT', null::text, null::integer;
    return;
  end if;

  select * into v_control
  from public.core_v2_activation_control
  where singleton_id = true;

  if not found then
    return query select false, 'ACTIVATION_CONTROL_MISSING', null::text, null::integer;
    return;
  end if;

  if v_control.kill_switch or not v_control.global_enabled then
    return query select
      false,
      case when v_control.kill_switch
        then 'KILL_SWITCH_ACTIVE'
        else 'GLOBAL_DISABLED'
      end,
      v_control.activation_version,
      null::integer;
    return;
  end if;

  select * into v_tenant
  from public.core_v2_tenant_activation
  where tenant_id = p_tenant_id;
  if not found or not v_tenant.enabled or not v_tenant.canary_eligible then
    return query select
      false, 'TENANT_NOT_ENABLED', v_control.activation_version, null::integer;
    return;
  end if;

  if p_branch_id is not null then
    select * into v_branch
    from public.core_v2_branch_activation
    where tenant_id = p_tenant_id and branch_id = p_branch_id;
    if not found or not v_branch.enabled or not v_branch.canary_eligible then
      return query select
        false, 'BRANCH_NOT_ENABLED', v_control.activation_version, null::integer;
      return;
    end if;
  end if;

  v_digest := encode(
    extensions.digest(
      convert_to(
        p_tenant_id::text || '|' ||
        coalesce(p_branch_id::text, '<NULL_BRANCH>') || '|' ||
        p_stable_command_identity || '|' ||
        v_control.canary_seed || '|' ||
        v_control.canary_algorithm_version,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
  v_bucket := (('x' || substr(v_digest, 1, 8))::bit(32)::bigint % 100)::integer;

  v_feature_global := case p_feature
    when 'pos' then v_control.pos_enabled
    when 'admin_orders' then v_control.admin_orders_enabled
    when 'quote' then v_control.quote_issuer_enabled
    when 'outbox_worker' then v_control.outbox_worker_enabled
  end;
  v_feature_tenant := case p_feature
    when 'pos' then v_tenant.pos_enabled
    when 'admin_orders' then v_tenant.admin_orders_enabled
    when 'quote' then v_tenant.quote_enabled
    when 'outbox_worker' then true
  end;
  v_feature_branch := case
    when p_branch_id is null then true
    when p_feature = 'pos' then v_branch.pos_enabled
    when p_feature = 'admin_orders' then v_branch.admin_orders_enabled
    when p_feature = 'quote' then v_branch.quote_enabled
    when p_feature = 'outbox_worker' then true
  end;

  if not v_feature_global or not v_feature_tenant or not v_feature_branch then
    return query select
      false, 'FEATURE_DISABLED', v_control.activation_version, v_bucket;
    return;
  end if;

  if v_bucket >= v_control.deterministic_canary_percentage then
    return query select
      false, 'OUTSIDE_CANARY', v_control.activation_version, v_bucket;
    return;
  end if;

  return query select
    true, 'ENABLED', v_control.activation_version, v_bucket;
end;
$function$;

-- ===========================================================================
-- I. ATOMIC DATABASE-BACKED ISSUER RATE LIMIT
-- No PIN, JWT, context token, email, IP address or raw customer data is stored.
-- ===========================================================================

create function public.check_and_record_core_v2_issuer_rate_limit_v1(
  p_issuer_kind text,
  p_authenticated_user_id uuid,
  p_tenant_id uuid,
  p_branch_id uuid,
  p_subject_scope_hash text,
  p_attempt_succeeded boolean
)
returns table(
  allowed boolean,
  retry_after_seconds integer,
  remaining_attempts integer,
  rate_limit_version text
)
language plpgsql
volatile
parallel unsafe
security definer
set search_path = pg_catalog
as $function$
declare
  v_config public.core_v2_issuer_rate_limit_config%rowtype;
  v_window_start timestamptz;
  v_row public.core_v2_issuer_rate_limit_windows%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if p_issuer_kind not in ('authenticated_context','pos_pin_context')
     or p_authenticated_user_id is null
     or p_tenant_id is null
     or p_branch_id is null
     or p_subject_scope_hash !~ '^[0-9a-f]{64}$'
     or p_attempt_succeeded is null then
    raise exception using
      errcode = '22023',
      message = 'ISSUER_RATE_LIMIT_INPUT_INVALID';
  end if;

  select * into strict v_config
  from public.core_v2_issuer_rate_limit_config
  where issuer_kind = p_issuer_kind
  for share;

  if not v_config.enabled then
    return query select
      false,
      v_config.window_seconds,
      0,
      v_config.configuration_version;
    return;
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from v_now) / v_config.window_seconds)
      * v_config.window_seconds
  );

  insert into public.core_v2_issuer_rate_limit_windows (
    issuer_kind,
    authenticated_user_id,
    tenant_id,
    branch_id,
    subject_scope_hash,
    window_started_at,
    attempt_count,
    successful_attempt_count,
    failed_attempt_count,
    last_attempt_at,
    expires_at
  ) values (
    p_issuer_kind,
    p_authenticated_user_id,
    p_tenant_id,
    p_branch_id,
    p_subject_scope_hash,
    v_window_start,
    1,
    case when p_attempt_succeeded then 1 else 0 end,
    case when p_attempt_succeeded then 0 else 1 end,
    v_now,
    v_window_start + make_interval(secs => v_config.retention_seconds)
  )
  on conflict (
    issuer_kind,
    authenticated_user_id,
    tenant_id,
    branch_id,
    subject_scope_hash,
    window_started_at
  ) do update
  set attempt_count =
        public.core_v2_issuer_rate_limit_windows.attempt_count + 1,
      successful_attempt_count =
        public.core_v2_issuer_rate_limit_windows.successful_attempt_count
        + case when excluded.successful_attempt_count = 1 then 1 else 0 end,
      failed_attempt_count =
        public.core_v2_issuer_rate_limit_windows.failed_attempt_count
        + case when excluded.failed_attempt_count = 1 then 1 else 0 end,
      last_attempt_at = excluded.last_attempt_at
  returning * into v_row;

  return query select
    v_row.attempt_count <= v_config.maximum_attempts,
    case
      when v_row.attempt_count <= v_config.maximum_attempts then 0
      else greatest(
        1,
        ceil(
          extract(
            epoch from (
              v_window_start
              + make_interval(secs => v_config.window_seconds)
              - v_now
            )
          )
        )::integer
      )
    end,
    greatest(0, v_config.maximum_attempts - v_row.attempt_count),
    v_config.configuration_version;
end;
$function$;

-- ===========================================================================
-- K. CONTROLLED OPERATOR FUNCTIONS (ALL REMAIN UNGRANTED)
-- ===========================================================================

create function public.record_core_v2_verification_evidence_v1(
  p_package_version text,
  p_environment text,
  p_tenant_id uuid,
  p_branch_id uuid,
  p_test_suite_identifier text,
  p_test_run_identifier text,
  p_artifact_hash text,
  p_result text,
  p_started_at timestamptz,
  p_completed_at timestamptz,
  p_recorded_by uuid,
  p_change_ticket text,
  p_result_summary text,
  p_supersedes_evidence_id uuid default null
)
returns uuid
language plpgsql
volatile
parallel unsafe
security definer
set search_path = pg_catalog
as $function$
declare
  v_id uuid;
begin
  -- Application-level authorization intentionally permits active owner/admin
  -- profiles to record verification evidence; it does not grant membership in
  -- afex_core_activation_owner or afex_core_activation_operator.
  if p_recorded_by is null
     or not exists (
       select 1
       from public.profiles p
       where p.id = p_recorded_by
         and p.is_active = true
         and p.role in ('owner','admin')
         and (
           p_tenant_id is null
           or p.tenant_id = p_tenant_id
         )
     ) then
    raise exception using
      errcode = '42501',
      message = 'ACTIVATION_OPERATOR_NOT_AUTHORIZED';
  end if;

  insert into public.core_v2_verification_evidence (
    package_version,
    environment,
    tenant_id,
    branch_id,
    test_suite_identifier,
    test_run_identifier,
    artifact_hash,
    result,
    started_at,
    completed_at,
    recorded_by,
    change_ticket,
    result_summary,
    supersedes_evidence_id
  ) values (
    p_package_version,
    p_environment,
    p_tenant_id,
    p_branch_id,
    p_test_suite_identifier,
    p_test_run_identifier,
    p_artifact_hash,
    p_result,
    p_started_at,
    p_completed_at,
    p_recorded_by,
    p_change_ticket,
    p_result_summary,
    p_supersedes_evidence_id
  )
  returning evidence_id into v_id;

  return v_id;
end;
$function$;

create function public.register_core_v2_managed_identity_v1(
  p_database_role_name name,
  p_identity_kind text,
  p_purpose text,
  p_owner_team text,
  p_environment text,
  p_expected_membership_role name,
  p_secret_reference_label text,
  p_approved_by uuid,
  p_change_ticket text
)
returns uuid
language plpgsql
volatile
parallel unsafe
security definer
set search_path = pg_catalog
as $function$
declare
  v_id uuid;
  v_expected_oid oid;
  v_login_oid oid;
begin
  select oid into v_login_oid
  from pg_roles
  where rolname = p_database_role_name;
  if not found then
    raise exception using
      errcode = '55000',
      message = 'MANAGED_IDENTITY_DATABASE_ROLE_MISSING';
  end if;

  if not exists (
    select 1 from pg_roles
    where oid = v_login_oid
      and rolcanlogin = true
      and rolsuper = false
      and rolcreatedb = false
      and rolcreaterole = false
      and rolinherit = false
      and rolreplication = false
      and rolbypassrls = false
  ) then
    raise exception using
      errcode = '55000',
      message = 'MANAGED_IDENTITY_LOGIN_UNSAFE';
  end if;

  select oid into v_expected_oid
  from pg_roles
  where rolname = p_expected_membership_role;
  if not found then
    raise exception using
      errcode = '55000',
      message = 'MANAGED_IDENTITY_EXPECTED_ROLE_MISSING';
  end if;

  -- Managed LOGIN identities use explicit SET ROLE only: no automatic
  -- inheritance and no ability to re-grant their dedicated membership.
  if (
    select count(*)
    from pg_auth_members
    where member = v_login_oid
  ) <> 1 then
    raise exception using
      errcode = '55000',
      message = 'MANAGED_IDENTITY_MEMBERSHIP_COUNT_INVALID';
  end if;

  if not exists (
    select 1
    from pg_auth_members
    where member = v_login_oid
      and roleid = v_expected_oid
      and admin_option = false
      and inherit_option = false
      and set_option = true
  ) then
    raise exception using
      errcode = '55000',
      message = 'MANAGED_IDENTITY_MEMBERSHIP_INVALID';
  end if;

  if exists (
    select 1
    from pg_auth_members m
    join pg_roles granted_role on granted_role.oid = m.roleid
    where m.member = v_login_oid
      and granted_role.rolname <> p_expected_membership_role::text
  ) then
    raise exception using
      errcode = '55000',
      message = 'MANAGED_IDENTITY_EXTRA_MEMBERSHIP';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_approved_by
      and p.is_active = true
      and p.role in ('owner','admin')
  ) then
    raise exception using
      errcode = '42501',
      message = 'ACTIVATION_OPERATOR_NOT_AUTHORIZED';
  end if;

  insert into public.core_v2_managed_identities (
    database_role_name,
    identity_kind,
    purpose,
    active,
    owner_team,
    environment,
    approved_at,
    approved_by,
    approval_change_ticket,
    last_verified_at,
    expected_membership_role,
    secret_reference_label
  ) values (
    p_database_role_name,
    p_identity_kind,
    p_purpose,
    true,
    p_owner_team,
    p_environment,
    clock_timestamp(),
    p_approved_by,
    p_change_ticket,
    clock_timestamp(),
    p_expected_membership_role,
    p_secret_reference_label
  )
  returning identity_id into v_id;

  return v_id;
end;
$function$;

create function public.deactivate_core_v2_v1(
  p_operator_id uuid,
  p_change_ticket text,
  p_reason text,
  p_expected_record_version bigint
)
returns boolean
language plpgsql
volatile
parallel unsafe
security definer
set search_path = pg_catalog
as $function$
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = p_operator_id
      and p.is_active = true
      and p.role in ('owner','admin')
  ) then
    raise exception using
      errcode = '42501',
      message = 'ACTIVATION_OPERATOR_NOT_AUTHORIZED';
  end if;
  if p_change_ticket is null
     or length(btrim(p_change_ticket)) not between 3 and 128
     or p_reason is null
     or length(btrim(p_reason)) not between 3 and 500 then
    raise exception using
      errcode = '22023',
      message = 'DEACTIVATION_EVIDENCE_INVALID';
  end if;

  update public.core_v2_activation_control
  set global_enabled = false,
      kill_switch = true,
      pos_enabled = false,
      admin_orders_enabled = false,
      quote_issuer_enabled = false,
      outbox_worker_enabled = false,
      deterministic_canary_percentage = 0,
      current_change_ticket = p_change_ticket,
      deactivated_at = clock_timestamp(),
      deactivated_by = p_operator_id
  where singleton_id = true
    and record_version = p_expected_record_version;

  if not found then
    raise exception using
      errcode = '40001',
      message = 'ACTIVATION_VERSION_CONFLICT';
  end if;

  update public.core_v2_tenant_activation
  set enabled = false,
      canary_eligible = false,
      pos_enabled = false,
      admin_orders_enabled = false,
      quote_enabled = false,
      disabled_at = clock_timestamp(),
      disabled_reason = p_reason
  where enabled
     or canary_eligible
     or pos_enabled
     or admin_orders_enabled
     or quote_enabled;

  update public.core_v2_branch_activation
  set enabled = false,
      canary_eligible = false,
      pos_enabled = false,
      admin_orders_enabled = false,
      quote_enabled = false,
      disabled_at = clock_timestamp(),
      disabled_reason = p_reason
  where enabled
     or canary_eligible
     or pos_enabled
     or admin_orders_enabled
     or quote_enabled;

  return true;
end;
$function$;

/*
configure_core_v2_canary_v1 and activate_core_v2_canary_v1 are intentionally
not created. A safe activation function depends on the authoritative Package
6B quote contract and a trusted operator authentication handoff. Global
activation remains impossible in Package 6A.
*/

-- ===========================================================================
-- M. OWNERSHIP, RLS AND LEAST-PRIVILEGE MATRIX
-- ===========================================================================

alter table public.core_v2_activation_control
  owner to afex_core_activation_owner;
alter table public.core_v2_tenant_activation
  owner to afex_core_activation_owner;
alter table public.core_v2_branch_activation
  owner to afex_core_activation_owner;
alter table public.core_v2_verification_evidence
  owner to afex_core_activation_owner;
alter table public.core_v2_managed_identities
  owner to afex_core_activation_owner;
alter table public.core_v2_issuer_rate_limit_config
  owner to afex_core_activation_owner;
alter table public.core_v2_issuer_rate_limit_windows
  owner to afex_core_activation_owner;

alter table public.core_v2_activation_control enable row level security;
alter table public.core_v2_tenant_activation enable row level security;
alter table public.core_v2_branch_activation enable row level security;
alter table public.core_v2_verification_evidence enable row level security;
alter table public.core_v2_managed_identities enable row level security;
alter table public.core_v2_issuer_rate_limit_config enable row level security;
alter table public.core_v2_issuer_rate_limit_windows enable row level security;

alter table public.core_v2_activation_control force row level security;
alter table public.core_v2_tenant_activation force row level security;
alter table public.core_v2_branch_activation force row level security;
alter table public.core_v2_verification_evidence force row level security;
alter table public.core_v2_managed_identities force row level security;
alter table public.core_v2_issuer_rate_limit_config force row level security;
alter table public.core_v2_issuer_rate_limit_windows force row level security;

create policy core_v2_activation_owner_control_read
on public.core_v2_activation_control
for select to afex_core_activation_owner
using (true);
create policy core_v2_activation_owner_tenants_read
on public.core_v2_tenant_activation
for select to afex_core_activation_owner
using (true);
create policy core_v2_activation_owner_branches_read
on public.core_v2_branch_activation
for select to afex_core_activation_owner
using (true);
create policy core_v2_activation_owner_evidence_read
on public.core_v2_verification_evidence
for select to afex_core_activation_owner
using (true);
create policy core_v2_activation_owner_identities_read
on public.core_v2_managed_identities
for select to afex_core_activation_owner
using (true);
create policy core_v2_activation_owner_rate_config_read
on public.core_v2_issuer_rate_limit_config
for select to afex_core_activation_owner
using (true);
create policy core_v2_activation_owner_rate_windows_read
on public.core_v2_issuer_rate_limit_windows
for select to afex_core_activation_owner
using (true);

create policy core_v2_activation_operator_control
on public.core_v2_activation_control
for all to afex_core_activation_operator
using (true) with check (true);
create policy core_v2_activation_operator_tenants
on public.core_v2_tenant_activation
for all to afex_core_activation_operator
using (true) with check (true);
create policy core_v2_activation_operator_branches
on public.core_v2_branch_activation
for all to afex_core_activation_operator
using (true) with check (true);
create policy core_v2_activation_operator_evidence
on public.core_v2_verification_evidence
for insert to afex_core_activation_operator
with check (true);
create policy core_v2_activation_operator_identities
on public.core_v2_managed_identities
for all to afex_core_activation_operator
using (true) with check (true);
create policy core_v2_activation_operator_rate_config
on public.core_v2_issuer_rate_limit_config
for all to afex_core_activation_operator
using (true) with check (true);

create policy core_v2_context_issuer_rate_config_read
on public.core_v2_issuer_rate_limit_config
for select to afex_context_issuer
using (true);
create policy core_v2_context_issuer_rate_windows
on public.core_v2_issuer_rate_limit_windows
for all to afex_context_issuer
using (true) with check (true);

revoke all on table
  public.core_v2_activation_control,
  public.core_v2_tenant_activation,
  public.core_v2_branch_activation,
  public.core_v2_verification_evidence,
  public.core_v2_managed_identities,
  public.core_v2_issuer_rate_limit_config,
  public.core_v2_issuer_rate_limit_windows
from public, anon, authenticated, service_role, afex_core_runtime,
  afex_outbox_worker, afex_context_issuer, afex_core_activation_operator;

grant select, insert, update, delete
on table
  public.core_v2_activation_control,
  public.core_v2_tenant_activation,
  public.core_v2_branch_activation,
  public.core_v2_managed_identities,
  public.core_v2_issuer_rate_limit_config
to afex_core_activation_operator;
grant select, insert
on table public.core_v2_verification_evidence
to afex_core_activation_operator;
grant select, insert, update
on table public.core_v2_issuer_rate_limit_windows
to afex_context_issuer;
grant select
on table public.core_v2_issuer_rate_limit_config
to afex_context_issuer;

alter function public.reject_core_v2_immutable_change_v1()
  owner to afex_core_activation_owner;
alter function public.touch_core_v2_control_row_v1()
  owner to afex_core_activation_owner;
alter function public.is_core_v2_request_enabled_v1(uuid,uuid,text,text)
  owner to afex_core_activation_owner;
alter function public.check_and_record_core_v2_issuer_rate_limit_v1(
  text,uuid,uuid,uuid,text,boolean
) owner to afex_context_issuer;
alter function public.record_core_v2_verification_evidence_v1(
  text,text,uuid,uuid,text,text,text,text,timestamptz,timestamptz,
  uuid,text,text,uuid
) owner to afex_core_activation_operator;
alter function public.register_core_v2_managed_identity_v1(
  name,text,text,text,text,name,text,uuid,text
) owner to afex_core_activation_operator;
alter function public.deactivate_core_v2_v1(uuid,text,text,bigint)
  owner to afex_core_activation_operator;

revoke execute on function
  public.reject_core_v2_immutable_change_v1(),
  public.touch_core_v2_control_row_v1(),
  public.is_core_v2_request_enabled_v1(uuid,uuid,text,text),
  public.check_and_record_core_v2_issuer_rate_limit_v1(
    text,uuid,uuid,uuid,text,boolean
  ),
  public.record_core_v2_verification_evidence_v1(
    text,text,uuid,uuid,text,text,text,text,timestamptz,timestamptz,
    uuid,text,text,uuid
  ),
  public.register_core_v2_managed_identity_v1(
    name,text,text,text,text,name,text,uuid,text
  ),
  public.deactivate_core_v2_v1(uuid,text,text,bigint)
from public, anon, authenticated, service_role, afex_core_runtime,
  afex_outbox_worker, afex_context_issuer, afex_core_activation_operator;

-- Trigger owners execute their trigger functions implicitly. No runtime
-- EXECUTE grants are required or provided.

alter default privileges for role afex_core_activation_owner
in schema public revoke all on tables from public;
alter default privileges for role afex_core_activation_owner
in schema public revoke execute on functions from public;
alter default privileges for role afex_core_activation_operator
in schema public revoke execute on functions from public;

do $package6aa_fail_closed_assertion$
begin
  if not exists (
    select 1
    from public.core_v2_activation_control c
    where c.singleton_id
      and not c.global_enabled
      and c.kill_switch
      and not c.pos_enabled
      and not c.admin_orders_enabled
      and not c.quote_issuer_enabled
      and not c.outbox_worker_enabled
      and c.deterministic_canary_percentage=0
  )
  or exists (
    select 1
    from public.core_v2_tenant_activation
    where enabled or canary_eligible or pos_enabled
       or admin_orders_enabled or quote_enabled
  )
  or exists (
    select 1
    from public.core_v2_branch_activation
    where enabled or canary_eligible or pos_enabled
       or admin_orders_enabled or quote_enabled
  ) then
    raise exception using
      errcode='55000',
      message='PACKAGE6AA_FAIL_CLOSED_STATE_VIOLATION';
  end if;
end;
$package6aa_fail_closed_assertion$;

commit;

-- ===========================================================================
-- N. READ-ONLY STATIC VERIFICATION
-- ===========================================================================

select
  singleton_id,
  global_enabled,
  kill_switch,
  pos_enabled,
  admin_orders_enabled,
  quote_issuer_enabled,
  outbox_worker_enabled,
  deterministic_canary_percentage,
  canary_algorithm_version,
  activation_version,
  environment,
  record_version
from public.core_v2_activation_control;

select
  r.rolname,
  r.rolcanlogin,
  r.rolsuper,
  r.rolcreatedb,
  r.rolcreaterole,
  r.rolinherit,
  r.rolreplication,
  r.rolbypassrls
from pg_roles r
where r.rolname in (
  'afex_core_activation_owner',
  'afex_core_activation_operator',
  'afex_core_runtime',
  'afex_context_issuer',
  'afex_outbox_worker'
)
order by r.rolname;

select
  member_role.rolname as member_role,
  granted_role.rolname as granted_role,
  m.admin_option
from pg_auth_members m
join pg_roles member_role on member_role.oid = m.member
join pg_roles granted_role on granted_role.oid = m.roleid
where member_role.rolname in (
  'anon','authenticated','service_role','afex_core_runtime',
  'afex_outbox_worker','afex_context_issuer',
  'afex_core_activation_owner','afex_core_activation_operator'
)
or granted_role.rolname in (
  'afex_core_runtime','afex_outbox_worker','afex_context_issuer',
  'afex_core_activation_owner','afex_core_activation_operator'
)
order by member_role, granted_role;

with functions(signature) as (values
  ('public.create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)'),
  ('public.issue_atomic_authorization_context_v1(uuid,text,text)'),
  ('public.issue_pos_atomic_authorization_context_v1(text,uuid,text,text)'),
  ('public.consume_atomic_authorization_context_v1(text,text,uuid)'),
  ('public.is_core_v2_request_enabled_v1(uuid,uuid,text,text)'),
  ('public.check_and_record_core_v2_issuer_rate_limit_v1(text,uuid,uuid,uuid,text,boolean)'),
  ('public.record_core_v2_verification_evidence_v1(text,text,uuid,uuid,text,text,text,text,timestamptz,timestamptz,uuid,text,text,uuid)'),
  ('public.register_core_v2_managed_identity_v1(name,text,text,text,text,name,text,uuid,text)'),
  ('public.deactivate_core_v2_v1(uuid,text,text,bigint)')
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
  g.grantee,
  g.table_name,
  g.privilege_type,
  g.is_grantable
from information_schema.role_table_grants g
where g.table_schema = 'public'
  and g.table_name like 'core_v2_%'
order by g.table_name, g.grantee, g.privilege_type;

select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
from pg_policies
where schemaname = 'public'
  and tablename like 'core_v2_%'
order by tablename, policyname;

select
  c.relname as table_name,
  c.relrowsecurity,
  c.relforcerowsecurity,
  c.relowner::regrole as owner
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname like 'core_v2_%'
order by c.relname;

-- ===========================================================================
-- O. FOUNDATION HANDOFF (COMMENTS ONLY)
-- ===========================================================================
/*
This package ends with Core V2 globally disabled, the kill switch enabled,
all tenant and branch activation rows disabled, and every activation/runtime
function closed to browser, service and runtime roles. The next reviewed
package may build on these foundation objects but must not enable activation,
canary traffic or runtime execution as part of installation.
*/
