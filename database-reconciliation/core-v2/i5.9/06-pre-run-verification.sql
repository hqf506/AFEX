/*
AFEX Core V2 Package 6R pre-run verification.
STRICTLY READ ONLY. No Package 6 runtime function is invoked.

Run before each executable. INSTALL_REQUIRED/CREATE_REQUIRED is acceptable
only for an object created by the next executable in the frozen order:
06a-activation-foundation.sql -> 06b-authoritative-quote.sql
-> 06-activation.sql.
All FAIL rows are STOP conditions. Hashes are external evidence because
PostgreSQL cannot read repository files.
*/

with state as (
  select
    (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind='r' and c.relname in (
        'core_v2_activation_control','core_v2_tenant_activation',
        'core_v2_branch_activation','core_v2_verification_evidence',
        'core_v2_managed_identities','core_v2_issuer_rate_limit_config',
        'core_v2_issuer_rate_limit_windows'
      )) activation_tables,
    (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in (
        'reject_core_v2_immutable_change_v1','touch_core_v2_control_row_v1',
        'is_core_v2_request_enabled_v1',
        'check_and_record_core_v2_issuer_rate_limit_v1',
        'record_core_v2_verification_evidence_v1',
        'register_core_v2_managed_identity_v1','deactivate_core_v2_v1'
      )) activation_functions,
    (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in (
        'validate_atomic_authorization_context_internal_v1',
        'normalize_authoritative_quote_request_v1',
        'verify_authoritative_quote_hash_v1',
        'reject_financial_quote_mutation_v1',
        'issue_authoritative_financial_quote_v1',
        'validate_atomic_authorization_context_for_quote_v1',
        'verify_core_v2_activation_readiness_v2'
      )) quote_functions
)
select 'stage_gate' category,'target_stage' check_name,
  case
    when activation_tables=0 and activation_functions=0 and quote_functions=0
      then 'BEFORE_06A'
    when activation_tables=7 and activation_functions=7 and quote_functions=0
      then 'BEFORE_06B'
    when activation_tables=7 and activation_functions=7 and quote_functions=7
      then 'BEFORE_06'
    else 'FAIL'
  end result,
  format('activation_tables=%s activation_functions=%s quote_functions=%s',
    activation_tables,activation_functions,quote_functions) observed
from state;

with
artifacts(execution_order,artifact,sha256) as (values
  (1,'02c-security-foundation.sql','009395af590b53c39a33004c3ad63d1e28a176291d5cfbaa6feb9b71329e591d'),
  (2,'04-atomic-core.sql','40900e9e2bed32ef1f3064881081892719037924d19dfb9a6ff37f5d2feecfe7'),
  (3,'05-security.sql','df141eb3ad7c1ff9b9a2ca700a06b4493c524d671b384cf2c4d6a61b0fb569a3'),
  (4,'06a-activation-foundation.sql','2a08f8e0a4cdd387bf3be8009878edef6b0d128050138ca3ce5a053580409e6f'),
  (5,'06b-authoritative-quote.sql','14096898bd70204817f5008b7aeab79cdcd0747a43a13f5f05ac720d14e90c56'),
  (6,'06-activation.sql','1015a5280ea2bffdbcd35a2ea43f49ee2456a9feaf697e30a0bb94f781fa9991')
)
select
  'documented_hash'::text category,
  artifact check_name,
  'EXTERNAL_EVIDENCE_REQUIRED'::text result,
  format('order=%s sha256=%s',execution_order,sha256) observed
from artifacts
order by execution_order;

with
required(function_name,identity_arguments) as (values
  ('create_order_atomic_v2','jsonb, jsonb, jsonb, jsonb'),
  ('derive_atomic_financial_snapshot_v2','uuid, uuid, jsonb'),
  ('build_atomic_request_fingerprint_v2','jsonb, jsonb'),
  ('issue_atomic_authorization_context_v1','uuid, text, text'),
  ('issue_pos_atomic_authorization_context_v1','text, uuid, text, text'),
  ('revoke_atomic_authorization_context_v1','uuid, text'),
  ('consume_atomic_authorization_context_v1','text, text, uuid'),
  ('claim_atomic_outbox_events_v1','text, integer, integer'),
  ('complete_atomic_outbox_event_v1','uuid, text'),
  ('fail_atomic_outbox_event_v1','uuid, text, text, text, text'),
  ('verify_pos_pin_for_actor','text, uuid, uuid')
),
actual as (
  select p.proname,pg_get_function_identity_arguments(p.oid) identity_arguments
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in (
    select function_name from required
  )
)
select 'package5_prerequisite' category,
  r.function_name||'('||r.identity_arguments||')' check_name,
  case when count(a.proname)=1 then 'PASS' else 'FAIL' end result,
  count(a.proname)::text observed
from required r left join actual a
  on a.proname=r.function_name and a.identity_arguments=r.identity_arguments
group by r.function_name,r.identity_arguments
union all
select 'package5_overload','unexpected prerequisite overloads',
  case when count(*)=0 then 'PASS' else 'FAIL' end,count(*)::text
from actual a left join required r
  on r.function_name=a.proname and r.identity_arguments=a.identity_arguments
where r.function_name is null
order by category,check_name;

select 'package5_quote_prerequisite' category,
  'financial_quotes_core_read_v1 and afex_core_owner SELECT' check_name,
  case when (
    select count(*) from pg_policies
    where schemaname='public' and tablename='financial_quotes'
      and policyname='financial_quotes_core_read_v1'
      and cmd='SELECT' and roles=array['afex_core_owner'::name]
  )=1
  and has_table_privilege(
    'afex_core_owner','public.financial_quotes','SELECT'
  ) then 'PASS' else 'FAIL' end result,
  'Package 5R-B read policy and table privilege' observed;

with
dedicated(role_name,created_by_package6) as (values
  ('afex_core_owner',false),('afex_context_issuer',false),
  ('afex_outbox_worker',false),('afex_core_activation_owner',true),
  ('afex_core_activation_operator',true),('afex_core_runtime',true)
),
stage as (
  select case when to_regclass('public.core_v2_activation_control') is null
    then 4 else 5 end target_order
)
select 'dedicated_role' category,d.role_name check_name,
  case
    when r.oid is null and d.created_by_package6 and stage.target_order=4
      then 'CREATE_REQUIRED'
    when r.oid is null then 'FAIL'
    when not r.rolcanlogin and not r.rolsuper and not r.rolcreatedb
     and not r.rolcreaterole and not r.rolinherit
     and not r.rolreplication and not r.rolbypassrls then 'PASS'
    else 'FAIL'
  end result,
  case when r.oid is null then 'MISSING' else format(
    'login=%s super=%s createdb=%s createrole=%s inherit=%s replication=%s bypassrls=%s',
    r.rolcanlogin,r.rolsuper,r.rolcreatedb,r.rolcreaterole,r.rolinherit,
    r.rolreplication,r.rolbypassrls
  ) end observed
from dedicated d cross join stage left join pg_roles r on r.rolname=d.role_name
order by d.role_name;

select 'dedicated_role_membership' category,
  member_role.rolname||'->'||granted_role.rolname check_name,
  'FAIL' result,
  format('admin=%s inherit=%s set=%s',
    m.admin_option,m.inherit_option,m.set_option) observed
from pg_auth_members m
join pg_roles member_role on member_role.oid=m.member
join pg_roles granted_role on granted_role.oid=m.roleid
where granted_role.rolname in (
  'afex_core_owner','afex_context_issuer','afex_outbox_worker',
  'afex_core_activation_owner','afex_core_activation_operator',
  'afex_core_runtime'
)
order by granted_role.rolname,member_role.rolname;

with
objects(package_order,object_kind,object_name,signature) as (values
  (4,'table','core_v2_activation_control',null),
  (4,'table','core_v2_tenant_activation',null),
  (4,'table','core_v2_branch_activation',null),
  (4,'table','core_v2_verification_evidence',null),
  (4,'table','core_v2_managed_identities',null),
  (4,'table','core_v2_issuer_rate_limit_config',null),
  (4,'table','core_v2_issuer_rate_limit_windows',null),
  (5,'function','validate_atomic_authorization_context_internal_v1',
    'text, text, text, uuid'),
  (5,'function','normalize_authoritative_quote_request_v1','jsonb'),
  (5,'function','verify_authoritative_quote_hash_v1','jsonb, text'),
  (5,'function','reject_financial_quote_mutation_v1',''),
  (5,'function','issue_authoritative_financial_quote_v1','text, jsonb, text'),
  (5,'function','validate_atomic_authorization_context_for_quote_v1','text'),
  (5,'function','verify_core_v2_activation_readiness_v2',
    'text, text, uuid, uuid'),
  (6,'function','verify_core_v2_activation_readiness_v1','')
),
state as (
  select o.*,
    case when object_kind='table' then
      (to_regclass('public.'||object_name) is not null)
    else exists (
      select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname=o.object_name
        and pg_get_function_identity_arguments(p.oid)=o.signature
    ) end exact_present,
    case when object_kind='function' then (
      select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname=o.object_name
    ) else null end overload_count
  from objects o
),
stage as (
  select case
    when to_regclass('public.core_v2_activation_control') is null then 4
    when to_regprocedure(
      'public.validate_atomic_authorization_context_internal_v1(text,text,text,uuid)'
    ) is null then 5 else 6 end target_order
)
select 'package6_installation_state' category,
  object_name||coalesce('('||signature||')','') check_name,
  case
    when exact_present and (overload_count is null or overload_count=1)
      then 'PASS'
    when exact_present then 'FAIL'
    when coalesce(overload_count,0)>0 then 'FAIL'
    when package_order>=stage.target_order then 'INSTALL_REQUIRED'
    else 'FAIL'
  end result,
  format('package_order=%s kind=%s exact_present=%s overload_count=%s',
    package_order,object_kind,exact_present,coalesce(overload_count::text,'n/a'))
    observed
from state cross join stage
order by package_order,object_kind,object_name;

with expected(
  package_order,function_name,identity_arguments,owner_name,
  security_definer,volatility,parallel_mode
) as (values
  (4,'reject_core_v2_immutable_change_v1','','afex_core_activation_owner',false,'v','u'),
  (4,'touch_core_v2_control_row_v1','','afex_core_activation_owner',false,'v','u'),
  (4,'is_core_v2_request_enabled_v1','uuid, uuid, text, text','afex_core_activation_owner',true,'s','s'),
  (4,'check_and_record_core_v2_issuer_rate_limit_v1','text, uuid, uuid, uuid, text, boolean','afex_context_issuer',true,'v','u'),
  (4,'record_core_v2_verification_evidence_v1','text, text, uuid, uuid, text, text, text, text, timestamp with time zone, timestamp with time zone, uuid, text, text, uuid','afex_core_activation_operator',true,'v','u'),
  (4,'register_core_v2_managed_identity_v1','name, text, text, text, text, name, text, uuid, text','afex_core_activation_operator',true,'v','u'),
  (4,'deactivate_core_v2_v1','uuid, text, text, bigint','afex_core_activation_operator',true,'v','u'),
  (5,'validate_atomic_authorization_context_internal_v1','text, text, text, uuid','afex_core_owner',true,'v','u'),
  (5,'normalize_authoritative_quote_request_v1','jsonb','afex_core_owner',false,'i','s'),
  (5,'verify_authoritative_quote_hash_v1','jsonb, text','afex_core_owner',false,'i','s'),
  (5,'reject_financial_quote_mutation_v1','','afex_core_owner',false,'v','u'),
  (5,'issue_authoritative_financial_quote_v1','text, jsonb, text','afex_core_owner',true,'v','u'),
  (5,'validate_atomic_authorization_context_for_quote_v1','text','afex_core_owner',true,'v','u'),
  (5,'verify_core_v2_activation_readiness_v2','text, text, uuid, uuid','afex_core_activation_owner',true,'s','s'),
  (6,'verify_core_v2_activation_readiness_v1','','afex_core_owner',false,'s','s')
),
actual as (
  select p.oid,p.proname,
    pg_get_function_identity_arguments(p.oid) identity_arguments,
    owner_role.rolname owner_name,p.prosecdef,p.provolatile,p.proparallel,
    p.proconfig
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  join pg_roles owner_role on owner_role.oid=p.proowner
  where n.nspname='public' and p.proname in (
    select function_name from expected
  )
),
stage as (
  select case
    when to_regclass('public.core_v2_activation_control') is null then 4
    when to_regprocedure(
      'public.validate_atomic_authorization_context_internal_v1(text,text,text,uuid)'
    ) is null then 5
    else 6 end target_order
)
select 'package6_function_contract' category,
  e.function_name||'('||e.identity_arguments||')' check_name,
  case
    when count(a.oid)=0 and e.package_order>=stage.target_order
      then 'INSTALL_REQUIRED'
    when count(a.oid)=1
      and bool_and(a.owner_name=e.owner_name)
      and bool_and(a.prosecdef=e.security_definer)
      and bool_and(a.provolatile=e.volatility)
      and bool_and(a.proparallel=e.parallel_mode)
      and bool_and(a.proconfig=array['search_path=pg_catalog']::text[])
      then 'PASS'
    else 'FAIL'
  end result,
  format('target=%s package=%s count=%s owner=%s definer=%s volatility=%s parallel=%s',
    stage.target_order,e.package_order,count(a.oid),
    coalesce(string_agg(a.owner_name,','),'MISSING'),
    coalesce(bool_and(a.prosecdef=e.security_definer)::text,'false'),
    coalesce(bool_and(a.provolatile=e.volatility)::text,'false'),
    coalesce(bool_and(a.proparallel=e.parallel_mode)::text,'false')) observed
from expected e cross join stage
left join actual a
  on a.proname=e.function_name and a.identity_arguments=e.identity_arguments
group by e.package_order,e.function_name,e.identity_arguments,e.owner_name,
  e.security_definer,e.volatility,e.parallel_mode,stage.target_order
order by e.package_order,e.function_name;

with expected(table_name,column_count,column_signature) as (values
  ('core_v2_activation_control',19,
   'singleton_id:boolean,global_enabled:boolean,kill_switch:boolean,pos_enabled:boolean,admin_orders_enabled:boolean,quote_issuer_enabled:boolean,outbox_worker_enabled:boolean,deterministic_canary_percentage:integer,canary_algorithm_version:text,canary_seed:text,activation_version:text,environment:text,current_change_ticket:text,activated_at:timestamp with time zone,activated_by:uuid,deactivated_at:timestamp with time zone,deactivated_by:uuid,updated_at:timestamp with time zone,record_version:bigint'),
  ('core_v2_tenant_activation',15,
   'tenant_id:uuid,enabled:boolean,canary_eligible:boolean,pos_enabled:boolean,admin_orders_enabled:boolean,quote_enabled:boolean,activation_version:text,change_ticket:text,approved_by:uuid,approved_at:timestamp with time zone,disabled_at:timestamp with time zone,disabled_reason:text,created_at:timestamp with time zone,updated_at:timestamp with time zone,record_version:bigint'),
  ('core_v2_branch_activation',16,
   'tenant_id:uuid,branch_id:uuid,enabled:boolean,canary_eligible:boolean,pos_enabled:boolean,admin_orders_enabled:boolean,quote_enabled:boolean,activation_version:text,change_ticket:text,approved_by:uuid,approved_at:timestamp with time zone,disabled_at:timestamp with time zone,disabled_reason:text,created_at:timestamp with time zone,updated_at:timestamp with time zone,record_version:bigint'),
  ('core_v2_verification_evidence',16,
   'evidence_id:uuid,package_version:text,environment:text,tenant_id:uuid,branch_id:uuid,test_suite_identifier:text,test_run_identifier:text,artifact_hash:text,result:text,started_at:timestamp with time zone,completed_at:timestamp with time zone,recorded_at:timestamp with time zone,recorded_by:uuid,change_ticket:text,result_summary:text,supersedes_evidence_id:uuid'),
  ('core_v2_managed_identities',16,
   'identity_id:uuid,database_role_name:name,identity_kind:text,purpose:text,active:boolean,owner_team:text,environment:text,approved_at:timestamp with time zone,approved_by:uuid,approval_change_ticket:text,last_verified_at:timestamp with time zone,expected_membership_role:name,secret_reference_label:text,created_at:timestamp with time zone,updated_at:timestamp with time zone,record_version:bigint'),
  ('core_v2_issuer_rate_limit_config',8,
   'issuer_kind:text,enabled:boolean,window_seconds:integer,maximum_attempts:integer,retention_seconds:integer,configuration_version:text,updated_at:timestamp with time zone,record_version:bigint'),
  ('core_v2_issuer_rate_limit_windows',11,
   'issuer_kind:text,authenticated_user_id:uuid,tenant_id:uuid,branch_id:uuid,subject_scope_hash:text,window_started_at:timestamp with time zone,attempt_count:integer,successful_attempt_count:integer,failed_attempt_count:integer,last_attempt_at:timestamp with time zone,expires_at:timestamp with time zone')
),
actual as (
  select c.oid,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,
    count(a.attnum) filter (where a.attnum>0 and not a.attisdropped)
      column_count,
    string_agg(
      a.attname||':'||pg_catalog.format_type(a.atttypid,a.atttypmod),
      ',' order by a.attnum
    ) filter (where a.attnum>0 and not a.attisdropped) column_signature
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  left join pg_attribute a on a.attrelid=c.oid
  where n.nspname='public' and c.relname in (
    select table_name from expected
  )
  group by c.oid,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity
),
stage as (
  select case when to_regclass('public.core_v2_activation_control') is null
    then 4 else 5 end target_order
)
select 'package6_table_contract' category,e.table_name check_name,
  case
    when a.oid is null and stage.target_order=4 then 'INSTALL_REQUIRED'
    when a.oid is null then 'FAIL'
    when a.relkind='r' and a.relrowsecurity and a.relforcerowsecurity
      and a.column_count=e.column_count
      and a.column_signature=e.column_signature
      then 'PASS' else 'FAIL'
  end result,
  format('kind=%s columns=%s/%s rls=%s force=%s',
    coalesce(a.relkind::text,'MISSING'),coalesce(a.column_count,0),
    e.column_count,coalesce(a.relrowsecurity::text,'false'),
    coalesce(a.relforcerowsecurity::text,'false'))||
    ' signature='||coalesce(a.column_signature,'MISSING') observed
from expected e cross join stage left join actual a on a.relname=e.table_name
order by e.table_name;

with expected(object_kind,object_name) as (values
  ('index','idx_core_v2_tenant_activation_enabled'),
  ('index','idx_core_v2_branch_activation_enabled'),
  ('index','idx_core_v2_evidence_readiness'),
  ('index','idx_core_v2_managed_identity_active'),
  ('index','idx_core_v2_issuer_rate_limit_expiry'),
  ('trigger','trg_core_v2_verification_evidence_immutable'),
  ('trigger','trg_touch_core_v2_activation_control'),
  ('trigger','trg_touch_core_v2_tenant_activation'),
  ('trigger','trg_touch_core_v2_branch_activation'),
  ('trigger','trg_touch_core_v2_managed_identities'),
  ('trigger','trg_touch_core_v2_rate_limit_config'),
  ('policy','core_v2_activation_owner_control_read'),
  ('policy','core_v2_activation_owner_tenants_read'),
  ('policy','core_v2_activation_owner_branches_read'),
  ('policy','core_v2_activation_owner_evidence_read'),
  ('policy','core_v2_activation_owner_identities_read'),
  ('policy','core_v2_activation_owner_rate_config_read'),
  ('policy','core_v2_activation_owner_rate_windows_read'),
  ('policy','core_v2_activation_operator_control'),
  ('policy','core_v2_activation_operator_tenants'),
  ('policy','core_v2_activation_operator_branches'),
  ('policy','core_v2_activation_operator_evidence'),
  ('policy','core_v2_activation_operator_identities'),
  ('policy','core_v2_activation_operator_rate_config'),
  ('policy','core_v2_context_issuer_rate_config_read'),
  ('policy','core_v2_context_issuer_rate_windows')
),
state as (
  select e.*,
    case object_kind
      when 'index' then to_regclass('public.'||object_name) is not null
      when 'trigger' then exists (
        select 1 from pg_trigger where tgname=object_name and not tgisinternal
      )
      when 'policy' then exists (
        select 1 from pg_policies
        where schemaname='public' and policyname=object_name
      )
    end present
  from expected e
),
stage as (
  select case when to_regclass('public.core_v2_activation_control') is null
    then 4 else 5 end target_order
)
select 'package6_table_dependent_object' category,
  object_kind||':'||object_name check_name,
  case when present then 'REVIEW_REQUIRED'
    when stage.target_order=4 then 'INSTALL_REQUIRED' else 'FAIL' end result,
  present::text observed
from state cross join stage order by object_kind,object_name;

with roles(role_name,role_oid) as (values
  ('PUBLIC',0::oid),('anon',to_regrole('anon')),
  ('authenticated',to_regrole('authenticated')),
  ('service_role',to_regrole('service_role')),
  ('afex_core_runtime',to_regrole('afex_core_runtime')),
  ('afex_core_activation_owner',to_regrole('afex_core_activation_owner')),
  ('afex_core_activation_operator',to_regrole('afex_core_activation_operator')),
  ('afex_context_issuer',to_regrole('afex_context_issuer')),
  ('afex_outbox_worker',to_regrole('afex_outbox_worker'))
),
stage as (
  select case when to_regclass('public.core_v2_activation_control') is null
    then 4 else 5 end target_order
)
select 'atomic_entry_closure' category,role_name check_name,
  case
    when role_oid is null
      and role_name in (
        'afex_core_runtime','afex_core_activation_owner',
        'afex_core_activation_operator'
      ) and stage.target_order=4 then 'CREATE_REQUIRED'
    when role_oid is null then 'FAIL'
    when not has_function_privilege(
      role_oid,'public.create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)',
      'EXECUTE'
    ) then 'PASS' else 'FAIL'
  end result,
  case when role_oid is null
    then 'ROLE_MISSING'
    else has_function_privilege(
      role_oid,'public.create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)',
      'EXECUTE'
    )::text end observed
from roles cross join stage
order by role_name;

with critical(package_order,function_name,identity_arguments,expected_result,body_token) as (values
  (5,'validate_atomic_authorization_context_internal_v1','text, text, text, uuid',
   'TABLE(authorization_context_id uuid, actor_user_id uuid, tenant_id uuid, branch_id uuid, actor_role text, employee_id uuid, authorization_source text, idempotency_key_hash text, context_version text, expires_at timestamp with time zone, correlation_id uuid)',
   'atomic_authorization_contexts'),
  (5,'issue_authoritative_financial_quote_v1','text, jsonb, text','jsonb',
   'validate_atomic_authorization_context_internal_v1'),
  (5,'validate_atomic_authorization_context_for_quote_v1','text',
   'TABLE(authorization_context_id uuid, authenticated_user_id uuid, tenant_id uuid, branch_id uuid, actor_role text, employee_id uuid, authorization_source text, idempotency_key_hash text, context_version text, expires_at timestamp with time zone)',
   'non_consuming_quote'),
  (5,'verify_core_v2_activation_readiness_v2','text, text, uuid, uuid',
   'TABLE(gate_name text, passed boolean, blocking boolean, detail text)',
   'core_v2_activation_control')
),
actual as (
  select p.oid,p.proname,
    pg_get_function_identity_arguments(p.oid) identity_arguments,
    pg_get_function_result(p.oid) function_result,
    pg_get_functiondef(p.oid) function_body
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in (
    select function_name from critical
  )
),
stage as (
  select case
    when to_regclass('public.core_v2_activation_control') is null then 4
    when to_regprocedure(
      'public.validate_atomic_authorization_context_internal_v1(text,text,text,uuid)'
    ) is null then 5 else 6 end target_order
)
select 'critical_function_shape' category,
  c.function_name||'('||c.identity_arguments||')' check_name,
  case
    when count(a.oid)=0 and c.package_order>=stage.target_order
      then 'INSTALL_REQUIRED'
    when count(a.oid)=0 then 'FAIL'
    when count(a.oid)=1
      and bool_and(a.function_result=c.expected_result)
      and bool_and(position(c.body_token in a.function_body)>0)
      then 'PASS' else 'FAIL'
  end result,
  format('count=%s result=%s body_token=%s',
    count(a.oid),coalesce(string_agg(a.function_result,','),'MISSING'),
    c.body_token) observed
from critical c cross join stage left join actual a
  on a.proname=c.function_name and a.identity_arguments=c.identity_arguments
group by c.package_order,c.function_name,c.identity_arguments,
  c.expected_result,c.body_token,stage.target_order
order by c.function_name;

with functions(package_order,signature,owner_name) as (values
  (3,'public.create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)','afex_core_owner'),
  (5,'public.issue_authoritative_financial_quote_v1(text,jsonb,text)','afex_core_owner'),
  (5,'public.validate_atomic_authorization_context_for_quote_v1(text)','afex_core_owner'),
  (5,'public.validate_atomic_authorization_context_internal_v1(text,text,text,uuid)','afex_core_owner'),
  (5,'public.verify_core_v2_activation_readiness_v2(text,text,uuid,uuid)','afex_core_activation_owner'),
  (3,'public.verify_core_v2_activation_readiness_v1()','afex_core_owner'),
  (4,'public.is_core_v2_request_enabled_v1(uuid,uuid,text,text)','afex_core_activation_owner'),
  (4,'public.check_and_record_core_v2_issuer_rate_limit_v1(text,uuid,uuid,uuid,text,boolean)','afex_context_issuer'),
  (4,'public.record_core_v2_verification_evidence_v1(text,text,uuid,uuid,text,text,text,text,timestamptz,timestamptz,uuid,text,text,uuid)','afex_core_activation_operator'),
  (4,'public.register_core_v2_managed_identity_v1(name,text,text,text,text,name,text,uuid,text)','afex_core_activation_operator'),
  (4,'public.deactivate_core_v2_v1(uuid,text,text,bigint)','afex_core_activation_operator')
),
roles(role_name,role_oid) as (values
  ('PUBLIC',0::oid),('anon',to_regrole('anon')),
  ('authenticated',to_regrole('authenticated')),
  ('service_role',to_regrole('service_role')),
  ('afex_core_runtime',to_regrole('afex_core_runtime')),
  ('afex_core_activation_owner',to_regrole('afex_core_activation_owner')),
  ('afex_core_activation_operator',to_regrole('afex_core_activation_operator')),
  ('afex_context_issuer',to_regrole('afex_context_issuer')),
  ('afex_outbox_worker',to_regrole('afex_outbox_worker')),
  ('afex_core_owner',to_regrole('afex_core_owner'))
),
stage as (
  select case
    when to_regclass('public.core_v2_activation_control') is null then 4
    when to_regprocedure(
      'public.validate_atomic_authorization_context_internal_v1(text,text,text,uuid)'
    ) is null then 5 else 6 end target_order
)
select 'entry_point_closure' category,signature||':'||role_name check_name,
  case
    when role_oid is null and role_name in (
      'afex_core_runtime','afex_core_activation_owner',
      'afex_core_activation_operator'
    ) and stage.target_order=4 then 'CREATE_REQUIRED'
    when role_oid is null then 'FAIL'
    when to_regprocedure(signature) is null
      and package_order>=stage.target_order then 'INSTALL_REQUIRED'
    when to_regprocedure(signature) is null then 'FAIL'
    when has_function_privilege(role_oid,signature,'EXECUTE')
      =(role_name=owner_name) then 'PASS'
    else 'FAIL'
  end result,
  case
    when role_oid is null then 'ROLE_MISSING'
    when to_regprocedure(signature) is null then 'FUNCTION_MISSING'
    else format('actual=%s expected_owner_only=%s owner=%s',
      has_function_privilege(role_oid,signature,'EXECUTE'),
      role_name=owner_name,owner_name)
  end observed
from functions cross join roles cross join stage
order by signature,role_name;

with stale(function_name) as (values
  ('validate_atomic_authorization_context_for_quote_v0'),
  ('issue_authoritative_financial_quote_v0'),
  ('configure_core_v2_canary_v1'),
  ('activate_core_v2_canary_v1')
)
select 'stale_package6_object' category,function_name check_name,
  case when count(p.oid)=0 then 'PASS' else 'FAIL' end result,
  count(p.oid)::text observed
from stale s
left join pg_namespace n on n.nspname='public'
left join pg_proc p on p.pronamespace=n.oid and p.proname=s.function_name
group by function_name
order by function_name;

/*
EXPORTABLE BASELINE RESULT SETS.
Every row is REVIEW_REQUIRED and must be retained before each executable.
*/
select 'pre_owner_state' category,
  n.nspname||'.'||c.relname check_name,'REVIEW_REQUIRED' result,
  owner_role.rolname observed
from pg_class c join pg_namespace n on n.oid=c.relnamespace
join pg_roles owner_role on owner_role.oid=c.relowner
where n.nspname='public' and (
  c.relname like 'core_v2_%' or c.relname in (
    'financial_quotes','atomic_authorization_contexts'
  )
)
union all
select 'pre_owner_state',
  n.nspname||'.'||p.proname||'('||
    pg_get_function_identity_arguments(p.oid)||')',
  'REVIEW_REQUIRED',owner_role.rolname
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
join pg_roles owner_role on owner_role.oid=p.proowner
where n.nspname='public' and (
  p.proname like '%core_v2%' or p.proname like '%atomic_authorization_context%'
  or p.proname like '%authoritative%quote%'
)
order by check_name;

select 'pre_function_acl_state' category,
  n.nspname||'.'||p.proname||'('||
    pg_get_function_identity_arguments(p.oid)||')' check_name,
  'REVIEW_REQUIRED' result,coalesce(p.proacl::text,'DEFAULT_ACL') observed
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and (
  p.proname like '%core_v2%' or p.proname like '%atomic_authorization_context%'
  or p.proname like '%authoritative%quote%'
)
order by check_name;

select 'pre_table_acl_state' category,n.nspname||'.'||c.relname check_name,
  'REVIEW_REQUIRED' result,coalesce(c.relacl::text,'DEFAULT_ACL') observed
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('r','p','v','m','S')
  and (c.relname like 'core_v2_%' or c.relname in (
    'financial_quotes','atomic_authorization_contexts'
  ))
order by check_name;

select 'pre_schema_acl_state' category,n.nspname check_name,
  'REVIEW_REQUIRED' result,coalesce(n.nspacl::text,'DEFAULT_ACL') observed
from pg_namespace n where n.nspname='public';

select 'pre_default_acl_state' category,
  owner_role.rolname||':'||coalesce(n.nspname,'ALL_SCHEMAS')||':'||
    d.defaclobjtype check_name,
  'REVIEW_REQUIRED' result,coalesce(d.defaclacl::text,'NULL') observed
from pg_default_acl d join pg_roles owner_role on owner_role.oid=d.defaclrole
left join pg_namespace n on n.oid=d.defaclnamespace
where owner_role.rolname in (
  'afex_core_owner','afex_context_issuer','afex_outbox_worker',
  'afex_core_activation_owner','afex_core_activation_operator',
  'afex_core_runtime'
)
order by check_name;

select 'pre_policy_state' category,
  schemaname||'.'||tablename||':'||policyname check_name,
  'REVIEW_REQUIRED' result,
  cmd||':'||roles::text||':'||coalesce(qual,'NULL')||':'||
    coalesce(with_check,'NULL') observed
from pg_policies
where schemaname='public' and (
  tablename like 'core_v2_%' or tablename in (
    'financial_quotes','atomic_authorization_contexts'
  )
)
order by check_name;

select 'pre_constraint_state' category,
  n.nspname||'.'||c.relname||':'||con.conname check_name,
  'REVIEW_REQUIRED' result,
  con.contype||':'||pg_get_constraintdef(con.oid,true) observed
from pg_constraint con join pg_class c on c.oid=con.conrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and (
  c.relname like 'core_v2_%' or c.relname in (
    'financial_quotes','atomic_authorization_contexts'
  )
)
order by check_name;

select 'pre_index_state' category,
  schemaname||'.'||tablename||':'||indexname check_name,
  'REVIEW_REQUIRED' result,indexdef observed
from pg_indexes
where schemaname='public' and (
  tablename like 'core_v2_%' or tablename in (
    'financial_quotes','atomic_authorization_contexts'
  )
)
order by check_name;

select 'pre_trigger_state' category,
  n.nspname||'.'||c.relname||':'||t.tgname check_name,
  'REVIEW_REQUIRED' result,pg_get_triggerdef(t.oid) observed
from pg_trigger t join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and not t.tgisinternal and (
  c.relname like 'core_v2_%' or c.relname in (
    'financial_quotes','atomic_authorization_contexts'
  )
)
order by check_name;

/*
STAGE-DEPENDENT DISABLED-STATE SECTION.
Execute the three statements below only when stage_gate is BEFORE_06B or
BEFORE_06. They intentionally reference 06A tables and therefore must not be
selected for BEFORE_06A. The run card defines the exact selection procedure.
No statement invokes a Package runtime function.
*/
select 'disabled_state' category,'global_control' check_name,
  case when count(*)=1 and bool_and(
    not global_enabled and kill_switch
    and deterministic_canary_percentage=0
    and not pos_enabled and not admin_orders_enabled
    and not quote_issuer_enabled and not outbox_worker_enabled
  ) then 'PASS' else 'FAIL' end result,
  count(*)::text observed
from public.core_v2_activation_control
where singleton_id;

select 'disabled_state' category,'tenant_controls' check_name,
  case when count(*)=0 then 'PASS' else 'FAIL' end result,count(*)::text observed
from public.core_v2_tenant_activation
where enabled or canary_eligible or pos_enabled
   or admin_orders_enabled or quote_enabled;

select 'disabled_state' category,'branch_controls' check_name,
  case when count(*)=0 then 'PASS' else 'FAIL' end result,count(*)::text observed
from public.core_v2_branch_activation
where enabled or canary_eligible or pos_enabled
   or admin_orders_enabled or quote_enabled;
