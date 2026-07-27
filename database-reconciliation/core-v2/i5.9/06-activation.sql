/*
AFEX Core V2 I5.9 - Package 6
Activation, Legacy Coexistence, Controlled Runtime Access and Cutover Gates

STATIC PREPARATION ONLY
-----------------------
This artifact does not activate Core V2, grant its entry point, alter business
logic, change triggers, revoke legacy production paths, or write application
data. Every cutover/deactivation command is retained as a commented operator
runbook until Package 6A-A/6B prerequisites and Package 7 evidence are approved.

APPROVED DEPENDENCY HASHES (review complete; verify externally before execution)
  Package 2B-S:
    009395af590b53c39a33004c3ad63d1e28a176291d5cfbaa6feb9b71329e591d
  Package 4T:
    40900e9e2bed32ef1f3064881081892719037924d19dfb9a6ff37f5d2feecfe7
  Package 5R-B:
    df141eb3ad7c1ff9b9a2ca700a06b4493c524d671b384cf2c4d6a61b0fb569a3
  Package 6A:
    01466f6d61a90bfd56b2c4a40c776c8ce36cd850f9a24f47e89fd6d21e557351
  Package 6B:
    797e7baff7fc592decc6bf6765c6a6a6970befc1f22d6d86cc5c69fd08ec8cda

PostgreSQL cannot independently verify repository file hashes. An external
operator must attest every dependency hash and preserve that attestation as
review evidence before Package 7 or any activation decision.

HARD ACTIVATION BLOCKERS
------------------------
1. PostgreSQL cannot verify repository file hashes. The operator must verify
   all five approved dependencies externally and record reviewed evidence.
2. Trusted operator identity approval remains outstanding.
3. No separately managed server-only database login/secret owner is approved.
   Generic service_role is not accepted as afex_core_runtime authority.
4. The managed outbox worker login and secret owner are not assigned.
5. The issuer gateway/rate-limit integration and exact manual grants are not
   approved. The authoritative quote issuer exists but remains ungranted and
   quote_issuer_enabled remains false; caller totals remain prohibited.
6. Package 7 has not executed and no immutable PASS evidence is recorded.
7. The application has not adopted the context/quote/atomic flow.
8. Legacy mutation routes, policies, RPCs and triggers remain active until the
   application canary and Package 7 gates pass.
9. Customer Engine routes require route-by-route cutover approval.
10. Core V2 remains disabled.
*/

-- Repaired Package 6 executable dependencies (exact execution order):
--   06a-activation-foundation.sql
--     01466f6d61a90bfd56b2c4a40c776c8ce36cd850f9a24f47e89fd6d21e557351
--   06b-authoritative-quote.sql
--     797e7baff7fc592decc6bf6765c6a6a6970befc1f22d6d86cc5c69fd08ec8cda

-- ===========================================================================
-- A. EXACT DATABASE-OBJECT PREFLIGHT
-- ===========================================================================

do $object_preflight$
declare
  v_missing text;
  v_unexpected text;
  v_role text;
  v_row pg_roles%rowtype;
begin
  with expected(signature) as (values
    ('issue_atomic_authorization_context_v1(uuid,text,text)'),
    ('issue_pos_atomic_authorization_context_v1(text,uuid,text,text)'),
    ('revoke_atomic_authorization_context_v1(uuid,text)'),
    ('consume_atomic_authorization_context_v1(text,text,uuid)'),
    ('validate_atomic_authorization_context_internal_v1(text,text,text,uuid)'),
    ('validate_atomic_authorization_context_for_quote_v1(text)'),
    ('issue_authoritative_financial_quote_v1(text,jsonb,text)'),
    ('verify_authoritative_quote_hash_v1(jsonb,text)'),
    ('verify_core_v2_activation_readiness_v2(text,text,uuid,uuid)'),
    ('create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)'),
    ('claim_atomic_outbox_events_v1(text,integer,integer)'),
    ('complete_atomic_outbox_event_v1(uuid,text)'),
    ('fail_atomic_outbox_event_v1(uuid,text,text,text,text)')
  )
  select string_agg(signature,', ' order by signature)
  into v_missing
  from expected
  where to_regprocedure('public.'||signature) is null;

  if v_missing is not null then
    raise exception using errcode='55000',
      message='PACKAGE6_REQUIRED_SIGNATURE_MISSING',
      detail=v_missing;
  end if;

  with expected(proname,identity_args) as (values
    ('issue_atomic_authorization_context_v1','uuid, text, text'),
    ('issue_pos_atomic_authorization_context_v1','text, uuid, text, text'),
    ('revoke_atomic_authorization_context_v1','uuid, text'),
    ('consume_atomic_authorization_context_v1','text, text, uuid'),
    ('validate_atomic_authorization_context_internal_v1','text, text, text, uuid'),
    ('validate_atomic_authorization_context_for_quote_v1','text'),
    ('issue_authoritative_financial_quote_v1','text, jsonb, text'),
    ('verify_authoritative_quote_hash_v1','jsonb, text'),
    ('verify_core_v2_activation_readiness_v2','text, text, uuid, uuid'),
    ('create_order_atomic_v2','jsonb, jsonb, jsonb, jsonb'),
    ('claim_atomic_outbox_events_v1','text, integer, integer'),
    ('complete_atomic_outbox_event_v1','uuid, text'),
    ('fail_atomic_outbox_event_v1','uuid, text, text, text, text')
  ),
  actual as (
    select p.proname,pg_get_function_identity_arguments(p.oid) identity_args
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname in (select proname from expected)
  )
  select string_agg(format('%I(%s)',a.proname,a.identity_args),', '
                    order by a.proname,a.identity_args)
  into v_unexpected
  from actual a
  left join expected e
    on e.proname=a.proname and e.identity_args=a.identity_args
  where e.proname is null;

  if v_unexpected is not null then
    raise exception using errcode='55000',
      message='PACKAGE6_UNEXPECTED_OVERLOAD',
      detail=v_unexpected;
  end if;

  with protected_functions(signature) as (values
    ('issue_atomic_authorization_context_v1(uuid,text,text)'),
    ('issue_pos_atomic_authorization_context_v1(text,uuid,text,text)'),
    ('revoke_atomic_authorization_context_v1(uuid,text)'),
    ('consume_atomic_authorization_context_v1(text,text,uuid)'),
    ('validate_atomic_authorization_context_internal_v1(text,text,text,uuid)'),
    ('validate_atomic_authorization_context_for_quote_v1(text)'),
    ('issue_authoritative_financial_quote_v1(text,jsonb,text)'),
    ('verify_authoritative_quote_hash_v1(jsonb,text)'),
    ('verify_core_v2_activation_readiness_v2(text,text,uuid,uuid)'),
    ('create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)'),
    ('claim_atomic_outbox_events_v1(text,integer,integer)'),
    ('complete_atomic_outbox_event_v1(uuid,text)'),
    ('fail_atomic_outbox_event_v1(uuid,text,text,text,text)')
  ),
  prohibited_roles(role_name) as (values
    ('PUBLIC'),('anon'),('authenticated'),('service_role'),
    ('afex_core_runtime')
  )
  select string_agg(
    format('%I -> public.%s',r.role_name,f.signature),
    ', ' order by r.role_name,f.signature
  )
  into v_unexpected
  from prohibited_roles r
  cross join protected_functions f
  where case
    when r.role_name='PUBLIC' then exists (
      select 1
      from pg_proc p
      cross join lateral aclexplode(
        coalesce(p.proacl,acldefault('f'::"char",p.proowner))
      ) acl
      where p.oid=to_regprocedure('public.'||f.signature)
        and acl.grantee=0
        and acl.privilege_type='EXECUTE'
    )
    else has_function_privilege(
      r.role_name,'public.'||f.signature,'EXECUTE'
    )
  end;

  if v_unexpected is not null then
    raise exception using errcode='55000',
      message='PACKAGE6_UNEXPECTED_RUNTIME_EXECUTION_EXPOSURE',
      detail=v_unexpected;
  end if;

  with non_worker_functions(signature) as (values
    ('issue_atomic_authorization_context_v1(uuid,text,text)'),
    ('issue_pos_atomic_authorization_context_v1(text,uuid,text,text)'),
    ('revoke_atomic_authorization_context_v1(uuid,text)'),
    ('consume_atomic_authorization_context_v1(text,text,uuid)'),
    ('validate_atomic_authorization_context_internal_v1(text,text,text,uuid)'),
    ('validate_atomic_authorization_context_for_quote_v1(text)'),
    ('issue_authoritative_financial_quote_v1(text,jsonb,text)'),
    ('verify_authoritative_quote_hash_v1(jsonb,text)'),
    ('verify_core_v2_activation_readiness_v2(text,text,uuid,uuid)'),
    ('create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)')
  )
  select string_agg(signature,', ' order by signature)
  into v_unexpected
  from non_worker_functions
  where has_function_privilege(
    'afex_outbox_worker','public.'||signature,'EXECUTE'
  );

  if v_unexpected is not null then
    raise exception using errcode='55000',
      message='PACKAGE6_WORKER_EXECUTION_SCOPE_UNSAFE',
      detail=v_unexpected;
  end if;

  foreach v_role in array array[
    'afex_core_owner','afex_context_issuer','afex_outbox_worker',
    'afex_core_activation_owner','afex_core_activation_operator'
  ]
  loop
    select * into v_row from pg_roles where rolname=v_role;
    if not found then
      raise exception using errcode='55000',
        message='PACKAGE6_REQUIRED_ROLE_MISSING',detail=v_role;
    end if;
    if v_row.rolcanlogin or v_row.rolsuper or v_row.rolcreatedb
       or v_row.rolcreaterole or v_row.rolinherit or v_row.rolreplication
       or v_row.rolbypassrls then
      raise exception using errcode='55000',
        message='PACKAGE6_ROLE_DRIFT',detail=v_role;
    end if;
  end loop;
end;
$object_preflight$;

begin;

-- ===========================================================================
-- B. FAIL-CLOSED SERVER-RUNTIME ROLE FOUNDATION
-- ===========================================================================

do $runtime_role$
declare
  v_role pg_roles%rowtype;
begin
  if not exists (select 1 from pg_roles where rolname='afex_core_runtime') then
    create role afex_core_runtime
      nologin nosuperuser nocreatedb nocreaterole noinherit
      noreplication nobypassrls;
  end if;

  select * into strict v_role
  from pg_roles where rolname='afex_core_runtime';
  if v_role.rolcanlogin or v_role.rolsuper or v_role.rolcreatedb
     or v_role.rolcreaterole or v_role.rolinherit or v_role.rolreplication
     or v_role.rolbypassrls then
    raise exception using errcode='55000',
      message='AFEX_CORE_RUNTIME_ROLE_UNSAFE';
  end if;

  if exists (
    select 1
    from pg_auth_members m
    join pg_roles member_role on member_role.oid=m.member
    join pg_roles granted_role on granted_role.oid=m.roleid
    where (
      member_role.rolname='afex_core_runtime'
      and granted_role.rolname in (
        'afex_core_owner','afex_context_issuer','afex_outbox_worker',
        'afex_core_activation_owner','afex_core_activation_operator'
      )
    ) or (
      granted_role.rolname='afex_core_runtime'
      and member_role.rolname in (
        'anon','authenticated','service_role','afex_outbox_worker',
        'afex_core_activation_owner','afex_core_activation_operator'
      )
    )
  ) then
    raise exception using errcode='55000',
      message='AFEX_CORE_RUNTIME_MEMBERSHIP_UNSAFE';
  end if;
end;
$runtime_role$;

revoke create on schema public from afex_core_runtime;
grant usage on schema public to afex_core_runtime;

revoke execute on function
  public.issue_atomic_authorization_context_v1(uuid,text,text),
  public.issue_pos_atomic_authorization_context_v1(text,uuid,text,text),
  public.revoke_atomic_authorization_context_v1(uuid,text),
  public.consume_atomic_authorization_context_v1(text,text,uuid),
  public.create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb),
  public.claim_atomic_outbox_events_v1(text,integer,integer),
  public.complete_atomic_outbox_event_v1(uuid,text),
  public.fail_atomic_outbox_event_v1(uuid,text,text,text,text)
from afex_core_runtime;

revoke select,insert,update,delete,truncate,references,trigger
on table
  public.customers,public.orders,public.invoices,public.invoice_items,
  public.inventory_stock,public.inventory_movements,
  public.order_number_sequences,public.audit_logs,public.financial_quotes,
  public.idempotency_commands,public.atomic_outbox,
  public.atomic_authorization_contexts
from afex_core_runtime;

-- ===========================================================================
-- C. HISTORICAL STATIC, READ-ONLY, FAIL-CLOSED READINESS V1
-- Final activation readiness authority is Package 6A-A function
-- verify_core_v2_activation_readiness_v2(text,text,uuid,uuid).
-- ===========================================================================

create or replace function public.verify_core_v2_activation_readiness_v1()
returns table(
  gate_name text,
  passed boolean,
  blocking boolean,
  detail text
)
language sql
stable
parallel safe
security invoker
set search_path=pg_catalog
as $function$
  select *
  from (values
    (
      'dependency_hash_attestation',
      false,true,
      'External file hashes cannot be verified by PostgreSQL; reviewed operator evidence is required.'
    ),
    (
      'required_security_objects',
      to_regprocedure(
        'public.consume_atomic_authorization_context_v1(text,text,uuid)'
      ) is not null
      and to_regprocedure(
        'public.create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)'
      ) is not null
      and to_regprocedure(
        'public.validate_atomic_authorization_context_internal_v1(text,text,text,uuid)'
      ) is not null
      and to_regprocedure(
        'public.validate_atomic_authorization_context_for_quote_v1(text)'
      ) is not null
      and to_regprocedure(
        'public.issue_authoritative_financial_quote_v1(text,jsonb,text)'
      ) is not null
      and to_regprocedure(
        'public.verify_authoritative_quote_hash_v1(jsonb,text)'
      ) is not null
      and to_regprocedure(
        'public.verify_core_v2_activation_readiness_v2(text,text,uuid,uuid)'
      ) is not null,
      true,
      'Package 4T, 5R-B, 6A-A and 6B final exact contracts are present.'
    ),
    (
      'runtime_role_safe',
      exists (
        select 1 from pg_roles r
        where r.rolname='afex_core_runtime'
          and not r.rolcanlogin and not r.rolsuper
          and not r.rolinherit and not r.rolbypassrls
      ),
      true,
      'Role is inert until a separately managed server identity is approved.'
    ),
    (
      'atomic_entry_disabled',
      not has_function_privilege(
        'afex_core_runtime',
        'public.create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)',
        'EXECUTE'
      )
      and not has_function_privilege(
        'anon',
        'public.create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)',
        'EXECUTE'
      )
      and not has_function_privilege(
        'authenticated',
        'public.create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)',
        'EXECUTE'
      )
      and not has_function_privilege(
        'service_role',
        'public.create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)',
        'EXECUTE'
      ),
      true,
      'Must remain disabled until Package 7 and manual canary approval.'
    ),
    (
      'internal_tables_closed',
      not has_table_privilege(
        'afex_core_runtime','public.atomic_authorization_contexts','SELECT'
      )
      and not has_table_privilege(
        'afex_core_runtime','public.idempotency_commands','SELECT'
      )
      and not has_table_privilege(
        'afex_core_runtime','public.atomic_outbox','SELECT'
      ),
      true,
      'Runtime caller must use SECURITY DEFINER entry points only.'
    ),
    (
      'context_issuer_runtime_path_approved',
      false,true,
      'Distinct server caller preserving auth.uid plus database/app rate limits is not approved.'
    ),
    (
      'authoritative_quote_issuer_ready',
      false,true,
      'Package 6B issuer exists but is ungranted and quote_issuer_enabled must remain false until all operational and Package 7 gates pass.'
    ),
    (
      'worker_identity_assigned',
      false,true,
      'Worker login/service identity and secret owner are external prerequisites.'
    ),
    (
      'legacy_mutation_paths_closed',
      false,true,
      'Legacy direct grants, policies, RPCs and mutation triggers remain for coexistence.'
    ),
    (
      'package3_evidence_approved',
      false,true,
      'Operator must record reviewed Package 3 backfill/evidence completion.'
    ),
    (
      'server_authoritative_feature_flags_ready',
      false,true,
      'Package 6A-A metadata exists, but Core V2 remains disabled pending controlled readiness V2 and operator approval.'
    ),
    (
      'package7_pass_recorded',
      false,true,
      'Package 6A-A evidence storage exists, but Package 7 must execute and record immutable PASS evidence through the controlled path.'
    ),
    (
      'global_activation',
      false,true,
      'Global activation is intentionally impossible in this package.'
    )
  ) gates(gate_name,passed,blocking,detail)
  order by gate_name;
$function$;

revoke execute on function
  public.verify_core_v2_activation_readiness_v1()
from public,anon,authenticated,service_role,afex_core_runtime,
  afex_context_issuer,afex_outbox_worker;

commit;

-- ===========================================================================
-- D. READ-ONLY EFFECTIVE-PRIVILEGE AND LEGACY INVENTORY
-- No query returns application rows, tokens, hashes, PINs or PII.
-- ===========================================================================

select * from public.verify_core_v2_activation_readiness_v1();

select
  r.rolname,r.rolcanlogin,r.rolsuper,r.rolcreatedb,r.rolcreaterole,
  r.rolinherit,r.rolreplication,r.rolbypassrls
from pg_roles r
where r.rolname in (
  'afex_core_owner','afex_context_issuer','afex_outbox_worker',
  'afex_core_runtime','afex_core_activation_owner',
  'afex_core_activation_operator','anon','authenticated','service_role'
)
order by r.rolname;

select
  member_role.rolname as member_role,
  granted_role.rolname as granted_role,
  m.admin_option
from pg_auth_members m
join pg_roles member_role on member_role.oid=m.member
join pg_roles granted_role on granted_role.oid=m.roleid
where member_role.rolname in (
  'afex_core_runtime','anon','authenticated','service_role',
  'afex_outbox_worker','afex_core_activation_owner',
  'afex_core_activation_operator'
)
   or granted_role.rolname in (
     'afex_core_runtime','afex_core_owner','afex_context_issuer',
     'afex_outbox_worker','afex_core_activation_owner',
     'afex_core_activation_operator'
   )
order by member_role,granted_role;

with checked_functions(signature) as (values
  ('public.issue_atomic_authorization_context_v1(uuid,text,text)'),
  ('public.issue_pos_atomic_authorization_context_v1(text,uuid,text,text)'),
  ('public.revoke_atomic_authorization_context_v1(uuid,text)'),
  ('public.consume_atomic_authorization_context_v1(text,text,uuid)'),
  ('public.validate_atomic_authorization_context_internal_v1(text,text,text,uuid)'),
  ('public.validate_atomic_authorization_context_for_quote_v1(text)'),
  ('public.issue_authoritative_financial_quote_v1(text,jsonb,text)'),
  ('public.verify_authoritative_quote_hash_v1(jsonb,text)'),
  ('public.verify_core_v2_activation_readiness_v2(text,text,uuid,uuid)'),
  ('public.create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)'),
  ('public.claim_atomic_outbox_events_v1(text,integer,integer)'),
  ('public.complete_atomic_outbox_event_v1(uuid,text)'),
  ('public.fail_atomic_outbox_event_v1(uuid,text,text,text,text)')
),
checked_roles(role_name) as (values
  ('PUBLIC'),('anon'),('authenticated'),('service_role'),
  ('afex_core_runtime'),('afex_outbox_worker')
)
select role_name,signature,
  case
    when role_name='PUBLIC' then exists (
      select 1
      from pg_proc p
      cross join lateral aclexplode(
        coalesce(p.proacl,acldefault('f'::"char",p.proowner))
      ) acl
      where p.oid=to_regprocedure(signature)
        and acl.grantee=0
        and acl.privilege_type='EXECUTE'
    )
    else has_function_privilege(role_name,signature,'EXECUTE')
  end as can_execute
from checked_roles cross join checked_functions
order by role_name,signature;

select
  g.grantee,g.table_name,g.privilege_type,g.is_grantable
from information_schema.role_table_grants g
where g.table_schema='public'
  and g.grantee in (
    'PUBLIC','anon','authenticated','service_role',
    'afex_core_runtime','afex_outbox_worker'
  )
  and g.table_name in (
    'customers','orders','invoices','invoice_items','inventory_stock',
    'inventory_movements','order_number_sequences','audit_logs',
    'financial_quotes','idempotency_commands','atomic_outbox',
    'atomic_authorization_contexts'
  )
order by g.table_name,g.grantee,g.privilege_type;

select
  p.schemaname,p.tablename,p.policyname,p.permissive,p.roles,p.cmd,
  p.qual,p.with_check
from pg_policies p
where p.schemaname='public'
  and p.tablename in (
    'customers','orders','invoices','invoice_items','inventory_stock',
    'inventory_movements','order_number_sequences','audit_logs',
    'financial_quotes','idempotency_commands','atomic_outbox',
    'atomic_authorization_contexts'
  )
order by p.tablename,p.policyname;

select
  p.oid::regprocedure as function_signature,
  p.proowner::regrole as owner,
  p.prosecdef as security_definer,
  p.proconfig as function_configuration,
  array_to_string(p.proacl,',') as acl_summary
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and (
    p.proname like 'create_invoice_with_items%'
    or p.proname in (
      'create_order_atomic_v2','next_branch_monthly_order_number',
      'deduct_inventory_on_invoice_item_insert',
      'set_order_number_branch_monthly',
      'set_invoice_number_from_order',
      'set_orders_branch_id','set_invoices_branch_id',
      'set_customers_branch_id'
    )
  )
order by function_signature::text;

select
  c.relname as table_name,t.tgname as trigger_name,
  t.tgenabled,p.oid::regprocedure as trigger_function,
  case
    when t.tgname='trg_deduct_inventory_on_invoice_item_insert'
      then 'CONFLICTING_INVENTORY_MUTATION'
    when t.tgname='trg_zzzz_set_order_number_branch_monthly'
      then 'CONFLICTING_NUMBER_ALLOCATION'
    when t.tgname='trg_zzzz_set_invoice_number_from_order'
      then 'REDUNDANT_NUMBER_PROPAGATION'
    when t.tgname like '%branch_id%'
      then 'LEGACY_SCOPE_DEFAULTING'
    when t.tgname like '%updated_at%'
      then 'COMPATIBLE_TIMESTAMP'
    else 'MANUAL_REVIEW'
  end as classification
from pg_trigger t
join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
join pg_proc p on p.oid=t.tgfoid
where n.nspname='public' and not t.tgisinternal
  and c.relname in (
    'orders','invoices','invoice_items','inventory_stock',
    'inventory_movements','order_number_sequences','customers'
  )
order by c.relname,t.tgname;

select
  d.defaclrole::regrole as grantor,
  coalesce(n.nspname,'*') as schema_name,
  d.defaclobjtype,d.defaclacl
from pg_default_acl d
left join pg_namespace n on n.oid=d.defaclnamespace
where n.nspname='public' or n.nspname is null
order by grantor::text,schema_name,d.defaclobjtype;

-- ===========================================================================
-- E. DISABLED OPERATOR RUNBOOK - NOT EXECUTABLE AS SHIPPED
-- ===========================================================================

/*
PACKAGE 6A-A / PACKAGE 6B PREREQUISITES
---------------------------------------
The approved additive packages now provide:
1. Package 6A-A server-authoritative activation metadata with global
   enabled=false, kill_switch=true, tenant/branch allowlists, deterministic
   canary, Package 7 immutable evidence storage, managed-identity metadata,
   issuer rate-limit foundation, shared quote-context validation delegation,
   Package 4T financial-parity gates and Package 6B quote-authority gates.
2. Package 6B authoritative quote issuance, one-context/one-quote linkage and
   quote immutability. The issuer remains ungranted and quote_issuer_enabled
   remains false.

Still required outside these packages:
3. A distinct managed server database identity that can use
   afex_core_runtime without giving that membership to service_role/browser
   roles.
4. A trusted issuer gateway enforcing the approved authenticated/POS rate
   limits while preserving auth.uid().
5. A separately managed worker login identity with membership only in
   afex_outbox_worker.
6. Package 7 execution and immutable PASS evidence through the controlled
   Package 6A-A evidence path.

Package 6 does not duplicate Package 6A-A or Package 6B functionality.

SAFE PRE-ACTIVATION HARDENING
-----------------------------
The executable section above creates only an inert runtime role and explicitly
revokes its function/table access. Package 5R-B already closes Core internal
tables. No legacy mutation path is revoked here because the application still
uses create_invoice_with_items_safe.

MANUAL CANARY ACTIVATION - KEEP COMMENTED UNTIL ALL READINESS GATES PASS
-------------------------------------------------------------------------
-- begin;
-- Treat verify_core_v2_activation_readiness_v1() as historical/static only.
-- Require Package 6A-A
-- verify_core_v2_activation_readiness_v2(text,text,uuid,uuid) to PASS.
-- Require explicit operator UUID, change ticket, tenant UUID, optional branch
-- UUID, deterministic cohort and Package 7 pass evidence.
-- Require kill_switch=false and global_enabled=false.
-- Apply separately reviewed managed runtime and quote-issuer grants only after
-- credential, rate-limit, least-privilege and change-control approval.
-- grant execute on function
--   public.create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)
-- to afex_core_runtime;
-- Enable exactly one tenant/branch canary in Package 6A-A metadata.
-- commit;

Do not grant Package 4 helpers or the context consumer. SECURITY DEFINER entry
ownership remains afex_core_owner. Do not grant the atomic entry point to
authenticated, anon or service_role.

AUTHENTICATED/POS ISSUER DECISION
---------------------------------
No issuer grant is activated here. Granting the POS issuer to authenticated
would bypass the existing application rate limiter and enable direct PIN
probing. Granting either issuer to service_role would not prove the end user.
Package 6A-A provides the rate-limit foundation, but deployment must provide a
reviewed gateway/database identity and bounded
database/application rate-limit contract while preserving auth.uid().

AUTHORITATIVE QUOTE DECISION
----------------------------
Package 6B provides the authoritative quote issuer. It accepts business intent
only, delegates non-consuming context validation through Package 5R-B, creates
one immutable quote per context, and remains ungranted with
quote_issuer_enabled=false. Package 4T verifies the exact quote hash, full
financial snapshot equality, exact derived snapshot hash equality and
configuration-drift rollback. Package 4T returns committed replay before
quote/current-price validation. Caller totals remain forbidden. Existence of
the issuer does not make it runtime-ready: Package 7 PASS, trusted identities,
gateway rate limiting, exact grants, feature gates and legacy closure remain
mandatory.

QUOTE/CONTEXT REPLAY
--------------------
New attempt: issue a new context, issue its linked authoritative quote, then
execute atomically; Package 4T consumes the context and verifies exact
snapshot/hash parity.

Failed PostgreSQL transaction: context consumption rolls back, so the same
still-valid context and quote may retry.

Committed timeout: a new context authenticates the retry with the same
idempotency key. Package 4T returns committed replay before quote/parity and
current-price stages; no new financial calculation is required.

Non-committed retry with a new context: a new quote linked to that context is
required.

FINAL CUTOVER REVOCATIONS - KEEP COMMENTED UNTIL CANARY/PACKAGE 7 PASS
----------------------------------------------------------------------
-- begin;
-- revoke execute on function public.create_invoice_with_items_safe(
--   text,text,text,text,numeric,numeric,text,jsonb,text,uuid,uuid,uuid
-- ) from public,anon,authenticated,service_role;
-- revoke execute on function
--   public.create_invoice_with_items(jsonb,jsonb),
--   public.create_invoice_with_items(
--     text,text,text,text,numeric,numeric,text,jsonb
--   ),
--   public.create_invoice_with_items(
--     text,text,text,text,numeric,numeric,text,json
--   )
-- from public,anon,authenticated,service_role;
--
-- revoke insert,update,delete on table
--   public.orders,public.invoices,public.invoice_items,
--   public.inventory_stock,public.inventory_movements,
--   public.order_number_sequences,public.audit_logs,
--   public.financial_quotes,public.idempotency_commands,
--   public.atomic_outbox,public.atomic_authorization_contexts
-- from public,anon,authenticated,service_role;
--
-- drop policy if exists "authenticated can insert invoice_items"
--   on public.invoice_items;
-- drop policy if exists "authenticated can update invoice_items"
--   on public.invoice_items;
-- drop policy if exists invoice_items_insert_same_tenant
--   on public.invoice_items;
-- drop policy if exists invoice_items_update_same_tenant
--   on public.invoice_items;
-- drop policy if exists "authenticated can insert invoices"
--   on public.invoices;
-- drop policy if exists "authenticated can update invoices"
--   on public.invoices;
-- drop policy if exists invoices_insert_same_tenant on public.invoices;
-- drop policy if exists invoices_update_same_tenant on public.invoices;
-- drop policy if exists "authenticated can insert orders" on public.orders;
-- drop policy if exists "authenticated can update orders" on public.orders;
-- drop policy if exists orders_insert_same_tenant on public.orders;
-- drop policy if exists orders_update_same_tenant on public.orders;
--
-- alter table public.invoice_items
--   disable trigger trg_deduct_inventory_on_invoice_item_insert;
-- alter table public.orders
--   disable trigger trg_zzzz_set_order_number_branch_monthly;
-- Package 4's safety assertion treats disabled conflicting triggers as safe.
-- commit;

Customer direct writes are intentionally not revoked in the generic cutover
block: current Admin/POS customer APIs must first be routed through approved
Customer Engine functions. Their broad duplicate policies remain classified as
unsafe and require a separate route-by-route cutover decision.

ROLLBACK RESTORATION - MANUAL AND REVIEWED
------------------------------------------
-- begin;
-- revoke execute on function
--   public.create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)
-- from afex_core_runtime;
-- Disable the canary and set kill_switch=true in Package 6A-A metadata.
-- alter table public.invoice_items
--   enable trigger trg_deduct_inventory_on_invoice_item_insert;
-- alter table public.orders
--   enable trigger trg_zzzz_set_order_number_branch_monthly;
-- Restore only the exact legacy EXECUTE/table/policy privileges captured
-- immediately before cutover. Never restore from generic assumptions.
-- commit;

KILL SWITCH / DEACTIVATION ORDER
--------------------------------
1. Set server-authoritative kill_switch=true and routing flags disabled.
2. Revoke create_order_atomic_v2 EXECUTE from afex_core_runtime.
3. Stop new context/quote issuance at the gateway.
4. Stop worker claims if provider delivery must pause; never delete events.
5. Allow already-running PostgreSQL transactions to commit or roll back.
6. Preserve contexts, quotes, idempotency, orders, audit and outbox evidence.
7. Restore only the reviewed legacy path required for application rollback.

OUTBOX WORKER IDENTITY HANDOFF
------------------------------
The deployment owner creates/manages an external login credential. It receives
membership only in afex_outbox_worker, never Core/context/runtime roles. It
calls only claim/complete/fail functions, validates returned payload_hash,
uses a unique high-entropy lease owner, redacts payloads/errors, and performs
provider network delivery outside SQL. Secrets belong in the deployment secret
manager, never tables, SQL files, logs or browser bundles.

APPLICATION HANDOFF (NO APPLICATION CHANGE IN THIS PACKAGE)
------------------------------------------------------------
Affected code:
- app/api/orders/route.ts
- app/api/pos/identify-employee-by-pin/route.ts
- lib/atomic-order/application.ts
- lib/atomic-order/service.ts
- lib/atomic-order/contracts.ts
- lib/authorization-context.ts
- lib/financial/*
- lib/core-v2-flags.ts

Required future flow:
1. Read the server-authoritative Package 6A-A routing decision.
2. Preserve the end-user JWT.
3. Apply issuer rate limiting.
4. Issue the authenticated/POS authorization context.
5. Call the Package 6B authoritative quote issuer with business intent only.
6. Use its returned canonical intent and quote evidence.
7. Submit the strict Package 4T security envelope.
8. Preserve canonical idempotency identity.
9. Use the managed runtime identity for atomic execution.
10. Follow the fresh-context/quote retry contract above.
11. Respect the kill switch and deterministic canary.
12. Never trust sessionStorage identity or caller totals.
13. Never call internal helpers, validators or consumers directly.

STAGED CUTOVER AND ROLLBACK
---------------------------
Stage 0: Review files/hashes only. Rollback: discard unexecuted package.
Stage 1: Apply additive foundations/5R-B/this inert role. Rollback: keep secure
         revokes; no traffic changed.
Stage 2: Deploy application support with all flags disabled. Rollback: deploy
         prior app; legacy path remains.
Stage 3: Apply Package 6A-A activation foundation and Package 6B quote
         authority while all feature gates and grants remain disabled.
         Rollback: keep kill switch on; retain immutable evidence.
Stage 4: Run Package 7 in staging/isolated tenant and record PASS only through
         the controlled immutable evidence path. Static SQL generation is not
         PASS. Rollback: no production activation.
Stage 5: Require readiness V2 PASS and separately reviewed exact runtime and
         issuer grants, then enable one explicit tenant/branch canary.
         Rollback: kill switch and revoke those exact grants.
Stage 6: Observe financial, inventory, numbering, idempotency, audit and outbox
         invariants. Rollback: freeze canary and investigate evidence.
Stage 7: Expand deterministic canary only by explicit approval. Rollback:
         reduce allowlist/cohort.
Stage 8: Revoke captured legacy mutation paths and disable conflicting
         triggers. Rollback: restore exact captured privileges/policies and
         triggers only if legacy application rollback is required.
Stage 9: Global activation requires separate approval. Rollback: kill switch,
         revoke runtime EXECUTE, preserve all committed evidence.

PACKAGE 7 FINAL HANDOFF
-----------------------
Package 7 must execute suites for dependency/hash attestation; role and
effective-privilege isolation; managed runtime/worker/operator identities;
context issue/consume/revoke/expiry/rollback; authenticated/POS rate limits;
shared context validation; authoritative quote calculation, hash integrity,
immutability and context linkage; exact financial snapshot parity and drift
rollback; committed replay after configuration changes; pricing, discount,
VAT and rounding parity; inventory, numbering and idempotency concurrency;
tenant/branch isolation; worker lease races; deterministic canary; kill
switch; legacy coexistence and closure; trigger closure;
rollback/deactivation; and immutable evidence recording.

Package 7 must target the final Package 4T, Package 5R-B, Package 6A-A and
Package 6B contracts listed above. Static generation or static inspection of
this package cannot establish Package 7 PASS.
*/
