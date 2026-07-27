/*
AFEX Core V2 Package 6R post-run verification.
STRICTLY READ ONLY. No Package 6 runtime function is invoked.
Run after 06A, 06B and 06 have each completed in the frozen order.
*/

with expected(
  function_name,identity_arguments,owner_name,security_definer,
  volatility,parallel_mode
) as (values
  ('reject_core_v2_immutable_change_v1','','afex_core_activation_owner',false,'v','u'),
  ('touch_core_v2_control_row_v1','','afex_core_activation_owner',false,'v','u'),
  ('is_core_v2_request_enabled_v1','uuid, uuid, text, text','afex_core_activation_owner',true,'s','s'),
  ('check_and_record_core_v2_issuer_rate_limit_v1','text, uuid, uuid, uuid, text, boolean','afex_context_issuer',true,'v','u'),
  ('record_core_v2_verification_evidence_v1','text, text, uuid, uuid, text, text, text, text, timestamp with time zone, timestamp with time zone, uuid, text, text, uuid','afex_core_activation_operator',true,'v','u'),
  ('register_core_v2_managed_identity_v1','name, text, text, text, text, name, text, uuid, text','afex_core_activation_operator',true,'v','u'),
  ('deactivate_core_v2_v1','uuid, text, text, bigint','afex_core_activation_operator',true,'v','u'),
  ('validate_atomic_authorization_context_internal_v1','text, text, text, uuid','afex_core_owner',true,'v','u'),
  ('normalize_authoritative_quote_request_v1','jsonb','afex_core_owner',false,'i','s'),
  ('verify_authoritative_quote_hash_v1','jsonb, text','afex_core_owner',false,'i','s'),
  ('reject_financial_quote_mutation_v1','','afex_core_owner',false,'v','u'),
  ('issue_authoritative_financial_quote_v1','text, jsonb, text','afex_core_owner',true,'v','u'),
  ('validate_atomic_authorization_context_for_quote_v1','text','afex_core_owner',true,'v','u'),
  ('verify_core_v2_activation_readiness_v2','text, text, uuid, uuid','afex_core_activation_owner',true,'s','s'),
  ('verify_core_v2_activation_readiness_v1','','afex_core_owner',false,'s','s')
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
)
select 'function_contract' category,
  e.function_name||'('||e.identity_arguments||')' check_name,
  case when count(a.oid)=1
    and bool_and(a.owner_name=e.owner_name)
    and bool_and(a.prosecdef=e.security_definer)
    and bool_and(a.provolatile=e.volatility)
    and bool_and(a.proparallel=e.parallel_mode)
    and bool_and(a.proconfig=array['search_path=pg_catalog']::text[])
    then 'PASS' else 'FAIL' end result,
  format('count=%s owner=%s definer=%s volatility=%s parallel=%s path=%s',
    count(a.oid),coalesce(string_agg(a.owner_name,','),'MISSING'),
    coalesce(bool_and(a.prosecdef=e.security_definer)::text,'false'),
    coalesce(bool_and(a.provolatile=e.volatility)::text,'false'),
    coalesce(bool_and(a.proparallel=e.parallel_mode)::text,'false'),
    coalesce(bool_and(a.proconfig=array['search_path=pg_catalog']::text[])::text,'false'))
    observed
from expected e left join actual a
  on a.proname=e.function_name and a.identity_arguments=e.identity_arguments
group by e.function_name,e.identity_arguments,e.owner_name,
  e.security_definer,e.volatility,e.parallel_mode
union all
select 'unexpected_overload','unexpected Package 6 overloads',
  case when count(*)=0 then 'PASS' else 'FAIL' end,count(*)::text
from actual a left join expected e
  on e.function_name=a.proname and e.identity_arguments=a.identity_arguments
where e.function_name is null
order by category,check_name;

with functions(signature,owner_name) as (values
  ('public.reject_core_v2_immutable_change_v1()','afex_core_activation_owner'),
  ('public.touch_core_v2_control_row_v1()','afex_core_activation_owner'),
  ('public.is_core_v2_request_enabled_v1(uuid,uuid,text,text)','afex_core_activation_owner'),
  ('public.check_and_record_core_v2_issuer_rate_limit_v1(text,uuid,uuid,uuid,text,boolean)','afex_context_issuer'),
  ('public.record_core_v2_verification_evidence_v1(text,text,uuid,uuid,text,text,text,text,timestamptz,timestamptz,uuid,text,text,uuid)','afex_core_activation_operator'),
  ('public.register_core_v2_managed_identity_v1(name,text,text,text,text,name,text,uuid,text)','afex_core_activation_operator'),
  ('public.deactivate_core_v2_v1(uuid,text,text,bigint)','afex_core_activation_operator'),
  ('public.validate_atomic_authorization_context_internal_v1(text,text,text,uuid)','afex_core_owner'),
  ('public.normalize_authoritative_quote_request_v1(jsonb)','afex_core_owner'),
  ('public.verify_authoritative_quote_hash_v1(jsonb,text)','afex_core_owner'),
  ('public.reject_financial_quote_mutation_v1()','afex_core_owner'),
  ('public.issue_authoritative_financial_quote_v1(text,jsonb,text)','afex_core_owner'),
  ('public.validate_atomic_authorization_context_for_quote_v1(text)','afex_core_owner'),
  ('public.verify_core_v2_activation_readiness_v2(text,text,uuid,uuid)','afex_core_activation_owner'),
  ('public.verify_core_v2_activation_readiness_v1()','afex_core_owner')
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
)
select 'function_execute_matrix' category,
  signature||':'||role_name check_name,
  case
    when role_oid is null then 'FAIL'
    when has_function_privilege(role_oid,signature,'EXECUTE')
         = (role_name=owner_name)
      then 'PASS' else 'FAIL'
  end result,
  case when role_oid is null
    then 'ROLE_MISSING'
    else format('actual=%s expected=%s owner=%s',
      has_function_privilege(role_oid,signature,'EXECUTE'),
      role_name=owner_name,owner_name) end observed
from functions cross join roles
order by signature,role_name;

with roles(role_name,role_oid) as (values
  ('PUBLIC',0::oid),('anon',to_regrole('anon')),
  ('authenticated',to_regrole('authenticated')),
  ('service_role',to_regrole('service_role')),
  ('afex_core_runtime',to_regrole('afex_core_runtime')),
  ('afex_core_activation_owner',to_regrole('afex_core_activation_owner')),
  ('afex_core_activation_operator',to_regrole('afex_core_activation_operator')),
  ('afex_context_issuer',to_regrole('afex_context_issuer')),
  ('afex_outbox_worker',to_regrole('afex_outbox_worker')),
  ('afex_core_owner',to_regrole('afex_core_owner'))
)
select 'atomic_entry_closure' category,role_name check_name,
  case when role_oid is null then 'FAIL'
    when has_function_privilege(
      role_oid,'public.create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)',
      'EXECUTE'
    ) = (role_name='afex_core_owner') then 'PASS' else 'FAIL' end result,
  case when role_oid is null
    then 'ROLE_MISSING' else format('actual=%s expected=%s',
      has_function_privilege(
        role_oid,'public.create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)',
        'EXECUTE'
      ),role_name='afex_core_owner') end observed
from roles order by role_name;

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

with expected(role_name) as (values
  ('afex_core_owner'),('afex_context_issuer'),('afex_outbox_worker'),
  ('afex_core_activation_owner'),('afex_core_activation_operator'),
  ('afex_core_runtime')
)
select 'dedicated_role_contract' category,e.role_name check_name,
  case when count(r.oid)=1 and bool_and(
    not r.rolcanlogin and not r.rolsuper and not r.rolcreatedb
    and not r.rolcreaterole and not r.rolinherit
    and not r.rolreplication and not r.rolbypassrls
  ) then 'PASS' else 'FAIL' end result,
  coalesce(string_agg(format(
    'login=%s super=%s createdb=%s createrole=%s inherit=%s replication=%s bypassrls=%s',
    r.rolcanlogin,r.rolsuper,r.rolcreatedb,r.rolcreaterole,r.rolinherit,
    r.rolreplication,r.rolbypassrls
  ),';'),'MISSING') observed
from expected e left join pg_roles r on r.rolname=e.role_name
group by e.role_name order by e.role_name;

with expected(table_name) as (values
  ('core_v2_activation_control'),('core_v2_tenant_activation'),
  ('core_v2_branch_activation'),('core_v2_verification_evidence'),
  ('core_v2_managed_identities'),('core_v2_issuer_rate_limit_config'),
  ('core_v2_issuer_rate_limit_windows')
)
select 'rls_force' category,e.table_name check_name,
  case when count(c.oid)=1
    and bool_and(c.relrowsecurity and c.relforcerowsecurity)
    then 'PASS' else 'FAIL' end result,
  format('count=%s rls=%s force=%s',count(c.oid),
    coalesce(bool_and(c.relrowsecurity)::text,'false'),
    coalesce(bool_and(c.relforcerowsecurity)::text,'false')) observed
from expected e
left join pg_namespace n on n.nspname='public'
left join pg_class c on c.relnamespace=n.oid and c.relname=e.table_name
  and c.relkind='r'
group by e.table_name order by e.table_name;

with expected(policy_name) as (values
  ('core_v2_activation_owner_control_read'),
  ('core_v2_activation_owner_tenants_read'),
  ('core_v2_activation_owner_branches_read'),
  ('core_v2_activation_owner_evidence_read'),
  ('core_v2_activation_owner_identities_read'),
  ('core_v2_activation_owner_rate_config_read'),
  ('core_v2_activation_owner_rate_windows_read'),
  ('core_v2_activation_operator_control'),
  ('core_v2_activation_operator_tenants'),
  ('core_v2_activation_operator_branches'),
  ('core_v2_activation_operator_evidence'),
  ('core_v2_activation_operator_identities'),
  ('core_v2_activation_operator_rate_config'),
  ('core_v2_context_issuer_rate_config_read'),
  ('core_v2_context_issuer_rate_windows'),
  ('financial_quotes_core_read_v1'),
  ('financial_quotes_core_insert_v1')
)
select 'policy_contract' category,e.policy_name check_name,
  case when count(p.policyname)=1 then 'PASS' else 'FAIL' end result,
  coalesce(string_agg(
    p.tablename||':'||p.cmd||':'||p.roles::text||':'||
    coalesce(p.qual,'NULL')||':'||coalesce(p.with_check,'NULL'),';'
  ),'MISSING') observed
from expected e left join pg_policies p
  on p.schemaname='public' and p.policyname=e.policy_name
group by e.policy_name
union all
select 'policy_contract','unexpected Package 6 policy',
  case when count(*)=0 then 'PASS' else 'FAIL' end,
  coalesce(string_agg(p.policyname,',' order by p.policyname),'NONE')
from pg_policies p
where p.schemaname='public'
  and (
    p.tablename like 'core_v2_%'
    or p.tablename='financial_quotes'
  )
  and p.policyname not in (select policy_name from expected)
order by category,check_name;

select 'quote_immutability_trigger' category,
  'trg_financial_quotes_immutable_v1' check_name,
  case when count(t.oid)=1 and bool_and(not t.tgisinternal)
    and bool_and(pg_get_triggerdef(t.oid) like
      '%BEFORE UPDATE OR DELETE ON public.financial_quotes%')
    then 'PASS' else 'FAIL' end result,
  coalesce(string_agg(pg_get_triggerdef(t.oid),';'),'MISSING') observed
from pg_trigger t
where t.tgrelid=to_regclass('public.financial_quotes')
  and t.tgname='trg_financial_quotes_immutable_v1';

with expected(trigger_name,table_name) as (values
  ('trg_core_v2_verification_evidence_immutable','core_v2_verification_evidence'),
  ('trg_touch_core_v2_activation_control','core_v2_activation_control'),
  ('trg_touch_core_v2_tenant_activation','core_v2_tenant_activation'),
  ('trg_touch_core_v2_branch_activation','core_v2_branch_activation'),
  ('trg_touch_core_v2_managed_identities','core_v2_managed_identities'),
  ('trg_touch_core_v2_rate_limit_config','core_v2_issuer_rate_limit_config'),
  ('trg_financial_quotes_immutable_v1','financial_quotes')
),
actual as (
  select t.oid,t.tgname,c.relname table_name
  from pg_trigger t join pg_class c on c.oid=t.tgrelid
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and not t.tgisinternal
    and t.tgname in (select trigger_name from expected)
)
select 'trigger_contract' category,
  e.trigger_name||':'||e.table_name check_name,
  case when count(a.oid)=1 then 'PASS' else 'FAIL' end result,
  count(a.oid)::text observed
from expected e left join actual a
  on a.tgname=e.trigger_name and a.table_name=e.table_name
group by e.trigger_name,e.table_name
union all
select 'trigger_contract','unexpected Package 6 trigger',
  case when count(*)=0 then 'PASS' else 'FAIL' end,count(*)::text
from actual a left join expected e
  on e.trigger_name=a.tgname and e.table_name=a.table_name
where e.trigger_name is null
order by category,check_name;

select 'quote_binding' category,'authorization-context FK and unique index'
  check_name,
  case when exists (
    select 1 from pg_constraint
    where conrelid=to_regclass('public.financial_quotes')
      and conname='fk_financial_quotes_authorization_context' and contype='f'
  ) and to_regclass('public.uq_financial_quotes_authorization_context')
      is not null
    then 'PASS' else 'FAIL' end result,
  'fk_financial_quotes_authorization_context;uq_financial_quotes_authorization_context'
    observed;

select 'schema_privilege' category,r.role_name check_name,
  case when has_schema_privilege(r.role_name,'public','USAGE')
    and not has_schema_privilege(r.role_name,'public','CREATE')
    then 'PASS' else 'FAIL' end result,
  format('usage=%s create=%s',
    has_schema_privilege(r.role_name,'public','USAGE'),
    has_schema_privilege(r.role_name,'public','CREATE')) observed
from (values ('afex_core_runtime')) r(role_name);

select 'default_acl_public_closure' category,
  owner_role.rolname||':'||coalesce(n.nspname,'ALL_SCHEMAS')||':'||d.defaclobjtype
    check_name,
  case when not exists (
    select 1 from aclexplode(d.defaclacl) x where x.grantee=0
  ) then 'PASS' else 'FAIL' end result,d.defaclacl::text observed
from pg_default_acl d
join pg_roles owner_role on owner_role.oid=d.defaclrole
left join pg_namespace n on n.oid=d.defaclnamespace
where owner_role.rolname in (
  'afex_core_activation_owner','afex_core_activation_operator'
)
order by check_name;

with expected(grantee,table_name,privilege_type) as (
  select 'afex_core_activation_operator',tables.table_name,
    privileges.privilege_type
  from unnest(array[
    'core_v2_activation_control','core_v2_tenant_activation',
    'core_v2_branch_activation','core_v2_managed_identities',
    'core_v2_issuer_rate_limit_config'
  ]) as tables(table_name)
  cross join unnest(array['SELECT','INSERT','UPDATE','DELETE'])
    as privileges(privilege_type)
  union all values
    ('afex_core_activation_operator','core_v2_verification_evidence','SELECT'),
    ('afex_core_activation_operator','core_v2_verification_evidence','INSERT'),
    ('afex_context_issuer','core_v2_issuer_rate_limit_windows','SELECT'),
    ('afex_context_issuer','core_v2_issuer_rate_limit_windows','INSERT'),
    ('afex_context_issuer','core_v2_issuer_rate_limit_windows','UPDATE'),
    ('afex_context_issuer','core_v2_issuer_rate_limit_config','SELECT'),
    ('afex_core_owner','financial_quotes','SELECT'),
    ('afex_core_owner','financial_quotes','INSERT')
),
actual as (
  select grantee,table_name,privilege_type
  from information_schema.role_table_grants
  where table_schema='public'
    and table_name in (
      'core_v2_activation_control','core_v2_tenant_activation',
      'core_v2_branch_activation','core_v2_verification_evidence',
      'core_v2_managed_identities','core_v2_issuer_rate_limit_config',
      'core_v2_issuer_rate_limit_windows','financial_quotes'
    )
    and grantee in (
      'PUBLIC','anon','authenticated','service_role','afex_core_runtime',
      'afex_core_activation_owner','afex_core_activation_operator',
      'afex_context_issuer','afex_outbox_worker','afex_core_owner'
    )
),
differences as (
  (select * from expected except select * from actual)
  union all
  (select * from actual except select * from expected)
)
select 'table_privilege_contract' category,'exact reviewed-role matrix'
  check_name,
  case when count(*)=0 then 'PASS' else 'FAIL' end result,
  coalesce(string_agg(
    grantee||':'||table_name||':'||privilege_type,',' order by
      grantee,table_name,privilege_type
  ),'NO_DIFFERENCE') observed
from differences;

select 'activation_state' category,'global_disabled' check_name,
  case when count(*)=1 and bool_and(
    not global_enabled and kill_switch and not pos_enabled
    and not admin_orders_enabled and not quote_issuer_enabled
    and not outbox_worker_enabled and deterministic_canary_percentage=0
  ) then 'PASS' else 'FAIL' end result,count(*)::text observed
from public.core_v2_activation_control where singleton_id
union all
select 'activation_state','tenant_disabled',
  case when count(*)=0 then 'PASS' else 'FAIL' end,count(*)::text
from public.core_v2_tenant_activation
where enabled or canary_eligible or pos_enabled
   or admin_orders_enabled or quote_enabled
union all
select 'activation_state','branch_disabled',
  case when count(*)=0 then 'PASS' else 'FAIL' end,count(*)::text
from public.core_v2_branch_activation
where enabled or canary_eligible or pos_enabled
   or admin_orders_enabled or quote_enabled;

with defs as (
  select p.proname,pg_get_functiondef(p.oid) body
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in (
    'validate_atomic_authorization_context_for_quote_v1',
    'issue_authoritative_financial_quote_v1',
    'verify_core_v2_activation_readiness_v2'
  )
)
select 'integration_isolation' category,proname check_name,
  case
    when proname='validate_atomic_authorization_context_for_quote_v1'
      and body like '%validate_atomic_authorization_context_internal_v1%'
      and body like '%non_consuming_quote%' then 'PASS'
    when proname='issue_authoritative_financial_quote_v1'
      and body like '%validate_atomic_authorization_context_internal_v1%'
      and body like '%financial_quotes%' then 'PASS'
    when proname='verify_core_v2_activation_readiness_v2'
      and body like '%core_v2_activation_control%'
      and body like '%financial_quotes%' then 'PASS'
    else 'FAIL'
  end result,'static body contract' observed
from defs order by proname;
