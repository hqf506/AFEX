/*
AFEX Core V2 I5.9 — Package 2B-S: Security Foundation Amendment

Purpose
-------
Add the minimum schema needed for short-lived, single-purpose,
database-verifiable service/POS authorization contexts and bind future Core V2
quotes to their issuing context. This package contains no issuer/consumer
functions, grants, permissive policies, business logic, worker delivery logic,
feature activation, trigger changes, or historical DML.

Execution order
---------------
After Packages 2/2B and before Package 5R. Package 4 requires a separately
reviewed amendment before it can consume this context. Package 6 must remain
disabled until Package 5R and Package 7 are complete.

Transaction model
-----------------
The three composite support indexes use CREATE INDEX CONCURRENTLY and therefore
run outside an explicit transaction. The additive table/column/constraint DDL
then runs atomically. Preflight rejects an existing index with the expected name
but a wrong, invalid, or unfinished definition.

Context semantics
-----------------
The opaque token is never stored; only its lowercase SHA-256 is stored. Release
1 contexts are single-use. Consumption belongs to the same PostgreSQL
transaction as the sale: a failed sale rolls consumption back and permits a
retry while the context remains issued and unexpired. A committed sale retains
state=consumed, so timeout recovery must use order idempotency replay rather
than consuming the context again.
*/

-- ---------------------------------------------------------------------------
-- A. Read-only preflight: required baseline objects and exact key columns.
-- ---------------------------------------------------------------------------

do $preflight$
declare
  r record;
  v_type text;
  v_not_null boolean;
begin
  for r in
    select *
    from (values
      ('tenants','id','uuid',true),
      ('branches','id','uuid',true),
      ('branches','tenant_id','uuid',false),
      ('profiles','id','uuid',true),
      ('profiles','tenant_id','uuid',false),
      ('profiles','branch_id','uuid',false),
      ('profiles','role','text',true),
      ('profiles','is_active','boolean',true),
      ('pos_profiles','id','uuid',true),
      ('pos_profiles','tenant_id','uuid',true),
      ('pos_profiles','branch_id','uuid',false),
      ('pos_profiles','role','text',true),
      ('pos_profiles','is_active','boolean',true),
      ('financial_quotes','id','uuid',true),
      ('financial_quotes','tenant_id','uuid',true),
      ('financial_quotes','branch_id','uuid',true),
      ('atomic_outbox','execution_status','text',true),
      ('atomic_outbox','next_attempt_at','timestamp with time zone',true),
      ('atomic_outbox','lease_owner','text',false),
      ('atomic_outbox','lease_expires_at','timestamp with time zone',false),
      ('atomic_outbox','attempt_count','integer',true),
      ('atomic_outbox','retry_count','integer',true),
      ('atomic_outbox','payload_hash','text',true),
      ('atomic_outbox','event_id','uuid',true)
    ) expected(table_name,column_name,type_name,not_null)
  loop
    if to_regclass(format('public.%I',r.table_name)) is null then
      raise exception 'SCHEMA_DRIFT: required table public.% is missing',
        r.table_name;
    end if;

    select format_type(a.atttypid,a.atttypmod),a.attnotnull
    into v_type,v_not_null
    from pg_attribute a
    where a.attrelid = format('public.%I',r.table_name)::regclass
      and a.attname = r.column_name
      and a.attnum > 0
      and not a.attisdropped;

    if not found or v_type <> r.type_name or v_not_null <> r.not_null then
      raise exception
        'SCHEMA_DRIFT: %.% expected type %, not_null %; found type %, not_null %',
        r.table_name,r.column_name,r.type_name,r.not_null,
        coalesce(v_type,'MISSING'),v_not_null;
    end if;
  end loop;
end;
$preflight$;

-- ---------------------------------------------------------------------------
-- B. Composite scope keys.
--
-- IDs are already globally unique. These reviewed, deliberately redundant
-- unique indexes exist only so composite foreign keys can make a mismatched
-- tenant/branch/actor context unrepresentable at the schema boundary.
-- Expected lock impact: concurrent scans; brief catalog locks at start/end.
-- ---------------------------------------------------------------------------

do $verify_scope_indexes_before$
declare
  r record;
  v_table regclass;
  v_unique boolean;
  v_valid boolean;
  v_ready boolean;
  v_keys text[];
begin
  for r in
    select *
    from (values
      ('uq_branches_tenant_id_id','branches',
       array['tenant_id','id']::text[]),
      ('uq_profiles_tenant_id_id','profiles',
       array['tenant_id','id']::text[]),
      ('uq_profiles_tenant_branch_id','profiles',
       array['tenant_id','branch_id','id']::text[]),
      ('uq_pos_profiles_tenant_branch_id','pos_profiles',
       array['tenant_id','branch_id','id']::text[])
    ) expected(index_name,table_name,key_columns)
  loop
    select
      i.indrelid::regclass,i.indisunique,i.indisvalid,i.indisready,
      array(
        select a.attname
        from unnest(i.indkey::smallint[]) with ordinality k(attnum,ord)
        join pg_attribute a
          on a.attrelid = i.indrelid and a.attnum = k.attnum
        where k.attnum > 0
        order by k.ord
      )
    into v_table,v_unique,v_valid,v_ready,v_keys
    from pg_index i
    join pg_class c on c.oid = i.indexrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = r.index_name;

    if found and (
      v_table <> format('public.%I',r.table_name)::regclass
      or not v_unique or not v_valid or not v_ready
      or v_keys <> r.key_columns
    ) then
      raise exception
        'INDEX_DRIFT: % exists with a wrong, invalid, or unfinished definition',
        r.index_name;
    end if;
  end loop;
end;
$verify_scope_indexes_before$;

create unique index concurrently if not exists uq_branches_tenant_id_id
  on public.branches (tenant_id,id);

create unique index concurrently if not exists uq_profiles_tenant_branch_id
  on public.profiles (tenant_id,branch_id,id);

create unique index concurrently if not exists uq_profiles_tenant_id_id
  on public.profiles (tenant_id,id);

create unique index concurrently if not exists uq_pos_profiles_tenant_branch_id
  on public.pos_profiles (tenant_id,branch_id,id);

-- ---------------------------------------------------------------------------
-- C. Additive context and quote-link foundation.
-- ---------------------------------------------------------------------------

begin;

create table if not exists public.atomic_authorization_contexts (
  context_id uuid
    default gen_random_uuid()
    constraint pk_atomic_authorization_contexts primary key,
  context_secret_hash text not null,
  context_nonce uuid not null default gen_random_uuid(),

  authenticated_user_id uuid not null,
  tenant_id uuid not null,
  branch_id uuid not null,

  profile_employee_id uuid,
  pos_profile_id uuid,
  pos_verified_at timestamptz,
  pos_verification_version text,
  employee_id uuid generated always as (
    coalesce(profile_employee_id,pos_profile_id)
  ) stored,

  actor_role text not null,
  authorization_source text not null,
  purpose text not null default 'create_order_atomic_v2',
  idempotency_key_hash text not null,

  context_version text not null default 'atomic-auth-context-v1',
  issued_by_service text not null,
  issuer_version text not null,
  server_request_id text,

  state text not null default 'issued',
  issued_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  revoked_by_user_id uuid,
  revocation_reason_code text,
  consumed_correlation_id uuid,
  updated_at timestamptz not null default clock_timestamp(),

  constraint uq_atomic_authorization_contexts_secret_hash
    unique (context_secret_hash),
  constraint uq_atomic_authorization_contexts_nonce
    unique (context_nonce),

  constraint ck_atomic_authorization_contexts_secret_hash
    check (context_secret_hash ~ '^[0-9a-f]{64}$'),
  constraint ck_atomic_authorization_contexts_idempotency_hash
    check (idempotency_key_hash ~ '^[0-9a-f]{64}$'),
  constraint ck_atomic_authorization_contexts_version
    check (context_version = 'atomic-auth-context-v1'),
  constraint ck_atomic_authorization_contexts_purpose
    check (purpose = 'create_order_atomic_v2'),
  constraint ck_atomic_authorization_contexts_state
    check (state in ('issued','consumed','revoked','expired')),
  constraint ck_atomic_authorization_contexts_ttl
    check (
      expires_at > issued_at
      and expires_at <= issued_at + interval '5 minutes'
    ),
  constraint ck_atomic_authorization_contexts_timestamps
    check (
      updated_at >= issued_at
      and (used_at is null or used_at >= issued_at)
      and (revoked_at is null or revoked_at >= issued_at)
    ),
  constraint ck_atomic_authorization_contexts_state_evidence
    check (
      (state = 'issued'
        and used_at is null
        and revoked_at is null
        and consumed_correlation_id is null)
      or
      (state = 'consumed'
        and used_at is not null
        and revoked_at is null
        and consumed_correlation_id is not null)
      or
      (state = 'revoked'
        and used_at is null
        and revoked_at is not null
        and consumed_correlation_id is null)
      or
      (state = 'expired'
        and used_at is null
        and revoked_at is null
        and consumed_correlation_id is null)
    ),
  constraint ck_atomic_authorization_contexts_revocation_evidence
    check (
      (state = 'revoked'
        and revocation_reason_code is not null
        and length(revocation_reason_code) between 1 and 128)
      or
      (state <> 'revoked'
        and revoked_by_user_id is null
        and revocation_reason_code is null)
    ),
  constraint ck_atomic_authorization_contexts_actor_role
    check (
      actor_role in (
        'owner','admin','manager','employee','cashier','pos_employee'
      )
    ),
  constraint ck_atomic_authorization_contexts_actor_identity
    check (
      (authorization_source = 'authenticated_user_jwt'
        and pos_profile_id is null
        and pos_verified_at is null
        and pos_verification_version is null
        and (
          (actor_role in ('owner','admin','manager')
            and profile_employee_id is null)
          or
          (actor_role in ('employee','cashier')
            and profile_employee_id = authenticated_user_id)
        ))
      or
      (authorization_source = 'pos_pin_server'
        and profile_employee_id is null
        and pos_profile_id is not null
        and pos_verified_at is not null
        and pos_verified_at <= issued_at
        and pos_verified_at > issued_at - interval '1 minute'
        and pos_verification_version = 'verify_pos_pin_for_actor-v1'
        and actor_role in ('admin','manager','employee','cashier'))
    ),
  constraint ck_atomic_authorization_contexts_issuer
    check (
      length(btrim(issued_by_service)) between 1 and 128
      and length(btrim(issuer_version)) between 1 and 128
      and (
        server_request_id is null
        or length(server_request_id) between 1 and 128
      )
    ),

  constraint fk_atomic_authorization_contexts_tenant
    foreign key (tenant_id)
    references public.tenants(id)
    on update no action on delete no action,
  constraint fk_atomic_authorization_contexts_branch_scope
    foreign key (tenant_id,branch_id)
    references public.branches(tenant_id,id)
    on update no action on delete no action,
  constraint fk_atomic_authorization_contexts_authenticated_user_scope
    foreign key (tenant_id,authenticated_user_id)
    references public.profiles(tenant_id,id)
    on update no action on delete no action,
  constraint fk_atomic_authorization_contexts_profile_employee_scope
    foreign key (tenant_id,branch_id,profile_employee_id)
    references public.profiles(tenant_id,branch_id,id)
    on update no action on delete no action,
  constraint fk_atomic_authorization_contexts_pos_employee_scope
    foreign key (tenant_id,branch_id,pos_profile_id)
    references public.pos_profiles(tenant_id,branch_id,id)
    on update no action on delete no action,
  constraint fk_atomic_authorization_contexts_revoked_by_user
    foreign key (revoked_by_user_id)
    references public.profiles(id)
    on update no action on delete no action
);

do $verify_context_contract$
declare
  r record;
  v_type text;
  v_not_null boolean;
  v_generated text;
begin
  for r in
    select *
    from (values
      ('context_id','uuid',true,''),
      ('context_secret_hash','text',true,''),
      ('context_nonce','uuid',true,''),
      ('authenticated_user_id','uuid',true,''),
      ('tenant_id','uuid',true,''),
      ('branch_id','uuid',true,''),
      ('profile_employee_id','uuid',false,''),
      ('pos_profile_id','uuid',false,''),
      ('pos_verified_at','timestamp with time zone',false,''),
      ('pos_verification_version','text',false,''),
      ('employee_id','uuid',false,'s'),
      ('actor_role','text',true,''),
      ('authorization_source','text',true,''),
      ('purpose','text',true,''),
      ('idempotency_key_hash','text',true,''),
      ('context_version','text',true,''),
      ('issued_by_service','text',true,''),
      ('issuer_version','text',true,''),
      ('state','text',true,''),
      ('issued_at','timestamp with time zone',true,''),
      ('expires_at','timestamp with time zone',true,''),
      ('used_at','timestamp with time zone',false,''),
      ('revoked_at','timestamp with time zone',false,'')
    ) expected(column_name,type_name,not_null,generated_kind)
  loop
    select format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attgenerated
    into v_type,v_not_null,v_generated
    from pg_attribute a
    where a.attrelid = 'public.atomic_authorization_contexts'::regclass
      and a.attname = r.column_name
      and a.attnum > 0
      and not a.attisdropped;

    if not found
       or v_type <> r.type_name
       or v_not_null <> r.not_null
       or v_generated <> r.generated_kind then
      raise exception
        'SCHEMA_DRIFT: atomic_authorization_contexts.% has an incompatible definition',
        r.column_name;
    end if;
  end loop;

  for r in
    select unnest(array[
      'pk_atomic_authorization_contexts',
      'uq_atomic_authorization_contexts_secret_hash',
      'uq_atomic_authorization_contexts_nonce',
      'ck_atomic_authorization_contexts_secret_hash',
      'ck_atomic_authorization_contexts_idempotency_hash',
      'ck_atomic_authorization_contexts_version',
      'ck_atomic_authorization_contexts_purpose',
      'ck_atomic_authorization_contexts_state',
      'ck_atomic_authorization_contexts_ttl',
      'ck_atomic_authorization_contexts_state_evidence',
      'ck_atomic_authorization_contexts_actor_identity',
      'fk_atomic_authorization_contexts_branch_scope',
      'fk_atomic_authorization_contexts_authenticated_user_scope',
      'fk_atomic_authorization_contexts_profile_employee_scope',
      'fk_atomic_authorization_contexts_pos_employee_scope'
    ]) as constraint_name
  loop
    if not exists (
      select 1
      from pg_constraint
      where conrelid = 'public.atomic_authorization_contexts'::regclass
        and conname = r.constraint_name
    ) then
      raise exception
        'SCHEMA_DRIFT: required context constraint % is missing',
        r.constraint_name;
    end if;
  end loop;
end;
$verify_context_contract$;

/*
Protective baseline only. No policy and no grant are created here. The table
owner bypasses RLS unless Package 5R chooses FORCE RLS or separates table and
function ownership.
*/
alter table public.atomic_authorization_contexts enable row level security;

create index if not exists idx_atomic_authorization_contexts_state_expiry
  on public.atomic_authorization_contexts (state,expires_at);

create index if not exists idx_atomic_authorization_contexts_actor_history
  on public.atomic_authorization_contexts (
    tenant_id,authenticated_user_id,issued_at desc
  );

create index if not exists idx_atomic_authorization_contexts_scope_history
  on public.atomic_authorization_contexts (
    tenant_id,branch_id,issued_at desc
  );

/*
Quote issuer linkage is nullable for legacy rows. Package 5R must require it in
the controlled quote issuer, and Package 6 must gate Core V2 activation on a
non-null link for every quote used by the atomic engine.
*/
alter table public.financial_quotes
  add column if not exists authorization_context_id uuid;
alter table public.financial_quotes
  add column if not exists issuer_context_version text;

do $verify_quote_link_columns$
declare
  r record;
  v_type text;
  v_not_null boolean;
begin
  for r in
    select *
    from (values
      ('authorization_context_id','uuid',false),
      ('issuer_context_version','text',false)
    ) expected(column_name,type_name,not_null)
  loop
    select format_type(a.atttypid,a.atttypmod),a.attnotnull
    into v_type,v_not_null
    from pg_attribute a
    where a.attrelid = 'public.financial_quotes'::regclass
      and a.attname = r.column_name
      and a.attnum > 0
      and not a.attisdropped;

    if not found or v_type <> r.type_name or v_not_null <> r.not_null then
      raise exception
        'SCHEMA_DRIFT: financial_quotes.% has an incompatible definition',
        r.column_name;
    end if;
  end loop;
end;
$verify_quote_link_columns$;

do $quote_link_constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.financial_quotes'::regclass
      and conname = 'fk_financial_quotes_authorization_context'
      and contype = 'f'
  ) then
    alter table public.financial_quotes
      add constraint fk_financial_quotes_authorization_context
      foreign key (authorization_context_id)
      references public.atomic_authorization_contexts(context_id)
      on update no action on delete no action
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.financial_quotes'::regclass
      and conname = 'ck_financial_quotes_issuer_context_version'
      and contype = 'c'
  ) then
    alter table public.financial_quotes
      add constraint ck_financial_quotes_issuer_context_version
      check (
        (authorization_context_id is null and issuer_context_version is null)
        or
        (authorization_context_id is not null
          and issuer_context_version = 'atomic-auth-context-v1')
      )
      not valid;
  end if;
end;
$quote_link_constraints$;

do $verify_quote_context_index_before$
declare
  v_unique boolean;
  v_valid boolean;
  v_ready boolean;
  v_keys text[];
  v_predicate text;
begin
  select
    i.indisunique,i.indisvalid,i.indisready,
    array(
      select a.attname
      from unnest(i.indkey::smallint[]) with ordinality k(attnum,ord)
      join pg_attribute a
        on a.attrelid = i.indrelid and a.attnum = k.attnum
      where k.attnum > 0
      order by k.ord
    ),
    pg_get_expr(i.indpred,i.indrelid)
  into v_unique,v_valid,v_ready,v_keys,v_predicate
  from pg_index i
  join pg_class c on c.oid = i.indexrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'uq_financial_quotes_authorization_context';

  if found and (
    not v_unique or not v_valid or not v_ready
    or v_keys <> array['authorization_context_id']::text[]
    or regexp_replace(v_predicate,'[[:space:]()]','','g')
       <> 'authorization_context_idISNOTNULL'
  ) then
    raise exception
      'INDEX_DRIFT: uq_financial_quotes_authorization_context is incompatible';
  end if;
end;
$verify_quote_context_index_before$;

create unique index if not exists uq_financial_quotes_authorization_context
  on public.financial_quotes (authorization_context_id)
  where authorization_context_id is not null;

commit;

-- ---------------------------------------------------------------------------
-- D. Read-only verification. Expected result: every boolean is true and every
-- invalid count is zero. No row payload, token hash, or customer PII is read.
-- ---------------------------------------------------------------------------

select
  to_regclass('public.atomic_authorization_contexts') is not null
    as context_table_exists,
  to_regclass('public.uq_branches_tenant_id_id') is not null
    as branch_scope_index_exists,
  to_regclass('public.uq_profiles_tenant_branch_id') is not null
    as profile_scope_index_exists,
  to_regclass('public.uq_profiles_tenant_id_id') is not null
    as authenticated_user_scope_index_exists,
  to_regclass('public.uq_pos_profiles_tenant_branch_id') is not null
    as pos_scope_index_exists,
  to_regclass('public.uq_financial_quotes_authorization_context') is not null
    as quote_context_index_exists;

select
  count(*) filter (
    where context_secret_hash !~ '^[0-9a-f]{64}$'
  ) as invalid_token_hash_count,
  count(*) filter (
    where idempotency_key_hash !~ '^[0-9a-f]{64}$'
  ) as invalid_idempotency_hash_count,
  count(*) filter (
    where expires_at <= issued_at
       or expires_at > issued_at + interval '5 minutes'
  ) as invalid_ttl_count,
  count(*) filter (
    where state = 'issued' and expires_at <= clock_timestamp()
  ) as issued_but_runtime_expired_count,
  count(*) filter (
    where purpose <> 'create_order_atomic_v2'
       or context_version <> 'atomic-auth-context-v1'
  ) as invalid_contract_count
from public.atomic_authorization_contexts;

select
  c.state,
  count(*) as context_count
from public.atomic_authorization_contexts c
group by c.state
order by c.state;

select
  count(*) filter (
    where authorization_context_id is null
  ) as legacy_quote_count,
  count(*) filter (
    where authorization_context_id is not null
      and issuer_context_version <> 'atomic-auth-context-v1'
  ) as invalid_linked_quote_version_count
from public.financial_quotes;

/*
Outbox schema decision: sufficient; no columns added.

Package 2 already supports:
  pending_commit -> processing -> delivered
  retryable -> processing
  terminal dead_letter/cancelled
with next_attempt_at, lease_owner, lease_expires_at, attempt_count, retry_count,
error fields, immutable event/payload hashes and unique event_id.

Package 5R worker functions must claim bounded batches with
FOR UPDATE SKIP LOCKED, require next_attempt_at <= clock_timestamp(), recover
expired processing leases, and forbid mutation of event type, aggregate,
payload, payload version and payload hash.

Retention recommendation: retain consumed/revoked/expired authorization
contexts for 30 days for incident investigation, then remove them only through
a separately reviewed maintenance package. No automatic deletion is included.
*/
