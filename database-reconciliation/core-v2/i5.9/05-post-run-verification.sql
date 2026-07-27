/*
AFEX Core V2 Package 5R-B post-run verification.

STRICTLY READ ONLY. Metadata inspection only. It does not invoke Package
runtime functions, change configuration, create temporary objects, or lock
application rows.
*/

with
expected_functions(
  function_name,identity_arguments,expected_owner,security_definer
) as (
  values
    ('resolve_atomic_authorization_v2','jsonb, jsonb','afex_core_owner',true),
    ('normalize_customer_phone_v2','text','afex_core_owner',false),
    ('resolve_customer_identity_v2','uuid, uuid, uuid, jsonb','afex_core_owner',true),
    ('resolve_customer_identity_result_v2','uuid, uuid, uuid, jsonb','afex_core_owner',true),
    ('build_atomic_request_fingerprint_v2','jsonb, jsonb','afex_core_owner',false),
    ('acquire_idempotency_command_v2','uuid, uuid, text, text, text, uuid, uuid, text, uuid','afex_core_owner',true),
    ('build_atomic_order_response_v1','uuid, uuid','afex_core_owner',true),
    ('allocate_branch_monthly_number_v2','uuid, uuid, date','afex_core_owner',true),
    ('assert_atomic_legacy_triggers_safe_v2','','afex_core_owner',true),
    ('resolve_inventory_requirements_v2','uuid, uuid, jsonb','afex_core_owner',true),
    ('lock_and_validate_inventory_v2','uuid, uuid, jsonb','afex_core_owner',true),
    ('build_inventory_movement_evidence_v2','uuid, uuid, uuid, uuid, uuid, uuid, uuid, numeric, numeric, numeric, bigint, bigint','afex_core_owner',false),
    ('apply_inventory_mutations_v2','uuid, uuid, uuid, uuid, uuid, uuid, jsonb, jsonb','afex_core_owner',true),
    ('atomic_semantic_event_uuid_v1','text','afex_core_owner',false),
    ('enqueue_atomic_outbox_v2','uuid, uuid, uuid, uuid, uuid, boolean, text, text, numeric, text, text, text, jsonb, uuid, timestamp with time zone','afex_core_owner',true),
    ('derive_atomic_financial_snapshot_v2','uuid, uuid, jsonb','afex_core_owner',true),
    ('create_order_atomic_v2','jsonb, jsonb, jsonb, jsonb','afex_core_owner',true),
    ('issue_atomic_authorization_context_v1','uuid, text, text','afex_context_issuer',true),
    ('issue_pos_atomic_authorization_context_v1','text, uuid, text, text','afex_context_issuer',true),
    ('revoke_atomic_authorization_context_v1','uuid, text','afex_context_issuer',true),
    ('consume_atomic_authorization_context_v1','text, text, uuid','afex_core_owner',true),
    ('claim_atomic_outbox_events_v1','text, integer, integer','afex_core_owner',true),
    ('complete_atomic_outbox_event_v1','uuid, text','afex_core_owner',true),
    ('fail_atomic_outbox_event_v1','uuid, text, text, text, text','afex_core_owner',true)
),
actual_functions as (
  select p.oid,p.proname,
    pg_get_function_identity_arguments(p.oid) identity_arguments,
    owner_role.rolname owner_name,p.prosecdef,p.proconfig
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  join pg_roles owner_role on owner_role.oid=p.proowner
  where n.nspname='public'
    and p.proname in (select function_name from expected_functions)
),
function_contract as (
  select
    row_number() over (order by e.function_name) item_order,
    'function_contract'::text category,
    e.function_name || '(' || e.identity_arguments || ')' check_name,
    case when count(a.oid)=1
      and bool_and(a.owner_name=e.expected_owner)
      and bool_and(a.prosecdef=e.security_definer)
      and bool_and(a.proconfig @> array['search_path=pg_catalog'])
      then 'PASS' else 'FAIL' end result,
    format('count=%s owner=%s security=%s safe_path=%s',
      count(a.oid),coalesce(string_agg(a.owner_name,','),'MISSING'),
      coalesce(bool_and(a.prosecdef=e.security_definer)::text,'false'),
      coalesce(bool_and(a.proconfig @> array['search_path=pg_catalog'])::text,'false')
    ) observed
  from expected_functions e
  left join actual_functions a
    on a.proname=e.function_name
   and a.identity_arguments=e.identity_arguments
  group by e.function_name,e.identity_arguments,e.expected_owner,e.security_definer
),
unexpected_overloads as (
  select 1 item_order,'unexpected_object'::text category,
    'unexpected_function_overloads'::text check_name,
    case when count(*)=0 then 'PASS' else 'FAIL' end result,
    count(*)::text observed
  from actual_functions a
  left join expected_functions e
    on e.function_name=a.proname and e.identity_arguments=a.identity_arguments
  where e.function_name is null
),
dedicated_roles(role_name) as (values
  ('afex_core_owner'),('afex_context_issuer'),('afex_outbox_worker')
),
role_contract as (
  select
    row_number() over (order by e.role_name) item_order,
    'role_contract'::text category,e.role_name check_name,
    case when count(r.oid)=1 and bool_and(
      not r.rolcanlogin and not r.rolsuper and not r.rolcreatedb
      and not r.rolcreaterole and not r.rolinherit
      and not r.rolreplication and not r.rolbypassrls
    ) then 'PASS' else 'FAIL' end result,
    count(r.oid)::text observed
  from dedicated_roles e left join pg_roles r on r.rolname=e.role_name
  group by e.role_name
),
membership_contract as (
  select 1 item_order,'role_contract'::text category,
    'unsafe_memberships'::text check_name,
    case when count(*)=0 then 'PASS' else 'FAIL' end result,count(*)::text observed
  from pg_auth_members m
  join pg_roles granted_role on granted_role.oid=m.roleid
  where granted_role.rolname in (
    'afex_core_owner','afex_context_issuer','afex_outbox_worker'
  )
),
reviewed_roles(role_name) as (values
  ('PUBLIC'),('anon'),('authenticated'),('service_role'),
  ('afex_core_runtime'),('afex_context_issuer'),('afex_outbox_worker'),
  ('afex_core_activation_operator'),('afex_core_owner')
),
expected_execute(role_name,function_name) as (values
  ('afex_context_issuer','issue_atomic_authorization_context_v1'),
  ('afex_context_issuer','issue_pos_atomic_authorization_context_v1'),
  ('afex_context_issuer','revoke_atomic_authorization_context_v1'),
  ('afex_outbox_worker','claim_atomic_outbox_events_v1'),
  ('afex_outbox_worker','complete_atomic_outbox_event_v1'),
  ('afex_outbox_worker','fail_atomic_outbox_event_v1')
),
atomic_entry_roles(role_name) as (values
  ('PUBLIC'),('anon'),('authenticated'),('service_role'),
  ('afex_core_runtime'),('afex_context_issuer'),('afex_outbox_worker'),
  ('afex_core_activation_operator')
),
atomic_entry_closure as (
  select
    row_number() over (order by r.role_name) item_order,
    'atomic_entry_closure'::text category,
    'create_order_atomic_v2:' || r.role_name check_name,
    case
      when p.oid is null then 'FAIL'
      when to_regrole(r.role_name) is null and r.role_name<>'PUBLIC'
        then 'FAIL'
      when not has_function_privilege(r.role_name,p.oid,'EXECUTE')
        then 'PASS'
      else 'FAIL'
    end result,
    case
      when p.oid is null then 'FUNCTION_MISSING'
      when to_regrole(r.role_name) is null and r.role_name<>'PUBLIC'
        then 'ROLE_MISSING'
      else has_function_privilege(r.role_name,p.oid,'EXECUTE')::text
    end observed
  from atomic_entry_roles r
  left join (
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='create_order_atomic_v2'
      and pg_get_function_identity_arguments(p.oid)=
        'jsonb, jsonb, jsonb, jsonb'
  ) p on true
),
acl_contract as (
  select
    row_number() over (
      order by e.function_name,e.identity_arguments,r.role_name
    ) item_order,
    'function_acl'::text category,
    e.function_name || '(' || e.identity_arguments || '):' || r.role_name
      check_name,
    case
      when a.oid is null then 'FAIL'
      when to_regrole(r.role_name) is null and r.role_name<>'PUBLIC' then 'FAIL'
      when has_function_privilege(r.role_name,a.oid,'EXECUTE')
        = (
          r.role_name=e.expected_owner
          or exists (
            select 1 from expected_execute x
            where x.role_name=r.role_name
              and x.function_name=e.function_name
          )
        )
      then 'PASS' else 'FAIL'
    end result,
    case when a.oid is null then 'FUNCTION_MISSING'
      when to_regrole(r.role_name) is null and r.role_name<>'PUBLIC'
        then 'ROLE_MISSING'
      else has_function_privilege(r.role_name,a.oid,'EXECUTE')::text
    end observed
  from expected_functions e cross join reviewed_roles r
  left join actual_functions a
    on a.proname=e.function_name
   and a.identity_arguments=e.identity_arguments
),
internal_tables(table_name) as (values
  ('atomic_authorization_contexts'),('financial_quotes'),
  ('idempotency_commands'),('atomic_outbox')
),
reviewed_tables(table_name) as (values
  ('profiles'),('pos_profiles'),('tenants'),('branches'),
  ('catalog_items'),('branch_catalog_items'),('discounts'),('vat_settings'),
  ('financial_quotes'),('customers'),('idempotency_commands'),
  ('order_number_sequences'),('inventory_stock'),('orders'),('invoices'),
  ('invoice_items'),('inventory_movements'),('audit_logs'),('atomic_outbox'),
  ('atomic_authorization_contexts')
),
table_privileges(privilege_name) as (values
  ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),
  ('REFERENCES'),('TRIGGER')
),
expected_table_acl(role_name,table_name,privilege_name) as (values
  ('afex_core_owner','profiles','SELECT'),
  ('afex_core_owner','pos_profiles','SELECT'),
  ('afex_core_owner','tenants','SELECT'),
  ('afex_core_owner','branches','SELECT'),
  ('afex_core_owner','catalog_items','SELECT'),
  ('afex_core_owner','branch_catalog_items','SELECT'),
  ('afex_core_owner','discounts','SELECT'),
  ('afex_core_owner','vat_settings','SELECT'),
  ('afex_core_owner','financial_quotes','SELECT'),
  ('afex_core_owner','customers','SELECT'),
  ('afex_core_owner','customers','INSERT'),
  ('afex_core_owner','customers','UPDATE'),
  ('afex_core_owner','idempotency_commands','SELECT'),
  ('afex_core_owner','idempotency_commands','INSERT'),
  ('afex_core_owner','idempotency_commands','UPDATE'),
  ('afex_core_owner','order_number_sequences','SELECT'),
  ('afex_core_owner','order_number_sequences','INSERT'),
  ('afex_core_owner','order_number_sequences','UPDATE'),
  ('afex_core_owner','inventory_stock','SELECT'),
  ('afex_core_owner','inventory_stock','INSERT'),
  ('afex_core_owner','inventory_stock','UPDATE'),
  ('afex_core_owner','orders','SELECT'),
  ('afex_core_owner','orders','INSERT'),
  ('afex_core_owner','invoices','SELECT'),
  ('afex_core_owner','invoices','INSERT'),
  ('afex_core_owner','invoice_items','SELECT'),
  ('afex_core_owner','invoice_items','INSERT'),
  ('afex_core_owner','inventory_movements','SELECT'),
  ('afex_core_owner','inventory_movements','INSERT'),
  ('afex_core_owner','audit_logs','SELECT'),
  ('afex_core_owner','audit_logs','INSERT'),
  ('afex_core_owner','atomic_outbox','SELECT'),
  ('afex_core_owner','atomic_outbox','INSERT'),
  ('afex_core_owner','atomic_authorization_contexts','SELECT'),
  ('afex_core_owner','atomic_authorization_contexts','UPDATE'),
  ('afex_context_issuer','atomic_authorization_contexts','SELECT'),
  ('afex_context_issuer','atomic_authorization_contexts','INSERT'),
  ('afex_context_issuer','atomic_authorization_contexts','UPDATE'),
  ('afex_context_issuer','profiles','SELECT'),
  ('afex_context_issuer','pos_profiles','SELECT'),
  ('afex_context_issuer','tenants','SELECT'),
  ('afex_context_issuer','branches','SELECT')
),
table_acl_contract as (
  select
    row_number() over (
      order by r.role_name,t.table_name,p.privilege_name
    ) item_order,
    'table_acl'::text category,
    r.role_name || ':' || t.table_name || ':' || p.privilege_name check_name,
    case when has_table_privilege(
      r.role_name,
      'public.' || quote_ident(t.table_name),
      p.privilege_name
    ) = exists (
      select 1 from expected_table_acl e
      where e.role_name=r.role_name
        and e.table_name=t.table_name
        and e.privilege_name=p.privilege_name
    ) then 'PASS' else 'FAIL' end result,
    has_table_privilege(
      r.role_name,
      'public.' || quote_ident(t.table_name),
      p.privilege_name
    )::text observed
  from (values
    ('afex_core_owner'),('afex_context_issuer'),('afex_outbox_worker')
  ) r(role_name)
  cross join reviewed_tables t
  cross join table_privileges p
),
rls_contract as (
  select
    row_number() over (order by e.table_name) item_order,
    'rls'::text category,e.table_name check_name,
    case when count(c.oid)=1 and bool_and(c.relrowsecurity)
      then 'PASS' else 'FAIL' end result,
    count(c.oid)::text observed
  from internal_tables e
  left join pg_namespace n on n.nspname='public'
  left join pg_class c on c.relnamespace=n.oid and c.relname=e.table_name
  group by e.table_name
),
expected_policies(table_name,policy_name,command_name,role_name) as (values
  ('atomic_authorization_contexts','context_issuer_insert_v1','INSERT','afex_context_issuer'),
  ('atomic_authorization_contexts','context_issuer_revoke_v1','UPDATE','afex_context_issuer'),
  ('atomic_authorization_contexts','context_issuer_read_v1','SELECT','afex_context_issuer'),
  ('atomic_authorization_contexts','context_core_consume_v1','ALL','afex_core_owner'),
  ('financial_quotes','financial_quotes_core_read_v1','SELECT','afex_core_owner'),
  ('idempotency_commands','idempotency_core_v1','ALL','afex_core_owner'),
  ('atomic_outbox','outbox_core_v1','ALL','afex_core_owner')
),
policy_contract as (
  select
    row_number() over (order by e.table_name,e.policy_name) item_order,
    'policy'::text category,e.table_name || '.' || e.policy_name check_name,
    case when count(p.policyname)=1
      and bool_and(p.permissive='PERMISSIVE')
      and bool_and(p.cmd=e.command_name)
      and bool_and(p.roles=array[e.role_name]::name[])
      and bool_and(
        case e.policy_name
          when 'context_issuer_insert_v1' then
            p.qual is null
            and p.with_check like '%state%issued%'
            and p.with_check like '%purpose%create_order_atomic_v2%'
            and p.with_check like '%context_version%atomic-auth-context-v1%'
          when 'context_issuer_revoke_v1' then
            p.qual like '%state%issued%'
            and p.with_check like '%state%'
            and p.with_check like '%issued%'
            and p.with_check like '%revoked%'
          when 'context_issuer_read_v1' then
            p.qual like '%authenticated_user_id%'
            and p.qual like '%auth.uid%'
            and p.with_check is null
          when 'context_core_consume_v1' then
            regexp_replace(lower(p.qual),'[[:space:]()]','','g')='true'
            and regexp_replace(
              lower(p.with_check),'[[:space:]()]','','g'
            )='true'
          when 'financial_quotes_core_read_v1' then
            regexp_replace(lower(p.qual),'[[:space:]()]','','g')='true'
            and p.with_check is null
          when 'idempotency_core_v1' then
            regexp_replace(lower(p.qual),'[[:space:]()]','','g')='true'
            and regexp_replace(
              lower(p.with_check),'[[:space:]()]','','g'
            )='true'
          when 'outbox_core_v1' then
            regexp_replace(lower(p.qual),'[[:space:]()]','','g')='true'
            and regexp_replace(
              lower(p.with_check),'[[:space:]()]','','g'
            )='true'
          else false
        end
      )
      then 'PASS' else 'FAIL' end result,
    count(p.policyname)::text observed
  from expected_policies e
  left join pg_policies p
    on p.schemaname='public'
   and p.tablename=e.table_name
   and p.policyname=e.policy_name
  group by e.table_name,e.policy_name,e.command_name,e.role_name
),
unexpected_policy as (
  select 1 item_order,'unexpected_object'::text category,
    'unexpected_internal_policies'::text check_name,
    case when count(*)=0 then 'PASS' else 'FAIL' end result,count(*)::text observed
  from pg_policies p
  left join expected_policies e
    on p.schemaname='public' and p.tablename=e.table_name
   and p.policyname=e.policy_name
  where p.schemaname='public'
    and p.tablename in (select table_name from internal_tables)
    and e.policy_name is null
),
browser_roles(role_name) as (values
  ('anon'),('authenticated'),('service_role')
),
internal_table_closure as (
  select
    row_number() over (order by r.role_name,t.table_name) item_order,
    'internal_table_acl'::text category,
    r.role_name || ':' || t.table_name check_name,
    case when not (
      has_table_privilege(r.role_name,'public.'||quote_ident(t.table_name),'SELECT')
      or has_table_privilege(r.role_name,'public.'||quote_ident(t.table_name),'INSERT')
      or has_table_privilege(r.role_name,'public.'||quote_ident(t.table_name),'UPDATE')
      or has_table_privilege(r.role_name,'public.'||quote_ident(t.table_name),'DELETE')
      or has_table_privilege(r.role_name,'public.'||quote_ident(t.table_name),'TRUNCATE')
      or has_table_privilege(r.role_name,'public.'||quote_ident(t.table_name),'REFERENCES')
      or has_table_privilege(r.role_name,'public.'||quote_ident(t.table_name),'TRIGGER')
    ) then 'PASS' else 'FAIL' end result,
    'see_boolean_contract'::text observed
  from browser_roles r cross join internal_tables t
),
schema_closure as (
  select
    row_number() over (order by role_name) item_order,
    'schema_acl'::text category,role_name check_name,
    case when not has_schema_privilege(role_name,'public','CREATE')
      then 'PASS' else 'FAIL' end result,
    has_schema_privilege(role_name,'public','CREATE')::text observed
  from (values ('anon'),('authenticated'),('service_role')) r(role_name)
),
default_acl_contract as (
  select
    row_number() over (order by owner_role.rolname,d.defaclobjtype) item_order,
    'default_acl'::text category,
    owner_role.rolname || ':' || d.defaclobjtype check_name,
    case when not exists (
      select 1 from aclexplode(d.defaclacl) x where x.grantee=0
    ) then 'PASS' else 'FAIL' end result,
    d.defaclacl::text observed
  from pg_default_acl d
  join pg_roles owner_role on owner_role.oid=d.defaclrole
  join pg_namespace n on n.oid=d.defaclnamespace
  where n.nspname='public'
    and owner_role.rolname in ('afex_core_owner','afex_context_issuer')
    and d.defaclobjtype in ('f','r','S')
),
default_acl_count as (
  select 1 item_order,'default_acl'::text category,
    'dedicated_default_acl_rows'::text check_name,
    case when count(*)=6 then 'PASS' else 'FAIL' end result,count(*)::text observed
  from pg_default_acl d
  join pg_roles r on r.oid=d.defaclrole
  join pg_namespace n on n.oid=d.defaclnamespace
  where n.nspname='public'
    and r.rolname in ('afex_core_owner','afex_context_issuer')
    and d.defaclobjtype in ('f','r','S')
),
public_default_function_acl as (
  select
    1 item_order,'default_acl'::text category,
    'no_public_default_function_execute'::text check_name,
    case when count(*)=0 then 'PASS' else 'FAIL' end result,
    count(*)::text observed
  from pg_default_acl d
  join pg_namespace n on n.oid=d.defaclnamespace
  cross join lateral aclexplode(d.defaclacl) x
  where n.nspname='public'
    and d.defaclobjtype='f'
    and x.grantee=0
    and x.privilege_type='EXECUTE'
),
shared_validator_contract as (
  select
    1 item_order,'shared_validator'::text category,
    'validate_atomic_authorization_context_internal_v1'::text check_name,
    case when count(p.oid)=1
      and bool_and(owner_role.rolname='afex_core_owner')
      and bool_and(p.prosecdef)
      and bool_and(p.proconfig @> array['search_path=pg_catalog'])
      then 'PASS' else 'FAIL' end result,
    count(p.oid)::text observed
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  join pg_roles owner_role on owner_role.oid=p.proowner
  where n.nspname='public'
    and p.proname='validate_atomic_authorization_context_internal_v1'
    and pg_get_function_identity_arguments(p.oid)='text, text, text, uuid'
),
shared_validator_acl as (
  select
    row_number() over (order by r.role_name) item_order,
    'shared_validator_acl'::text category,r.role_name check_name,
    case when p.oid is not null
      and (to_regrole(r.role_name) is not null or r.role_name='PUBLIC')
      and not has_function_privilege(r.role_name,p.oid,'EXECUTE')
      then 'PASS' else 'FAIL' end result,
    case when p.oid is null then 'FUNCTION_MISSING'
      when to_regrole(r.role_name) is null and r.role_name<>'PUBLIC'
        then 'ROLE_MISSING'
      else has_function_privilege(r.role_name,p.oid,'EXECUTE')::text
    end observed
  from (values
    ('PUBLIC'),('anon'),('authenticated'),('service_role'),
    ('afex_core_runtime'),('afex_context_issuer'),('afex_outbox_worker'),
    ('afex_core_activation_operator')
  ) r(role_name)
  left join (
    select p.oid
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='validate_atomic_authorization_context_internal_v1'
      and pg_get_function_identity_arguments(p.oid)='text, text, text, uuid'
  ) p on true
),
activation_contract as (
  select 1 item_order,'activation_state'::text category,
    'global_flags_disabled'::text check_name,
    case when count(*)=1 and bool_and(
      not global_enabled and kill_switch and not pos_enabled
      and not admin_orders_enabled and not quote_issuer_enabled
      and not outbox_worker_enabled and deterministic_canary_percentage=0
    ) then 'PASS' else 'FAIL' end result,count(*)::text observed
  from public.core_v2_activation_control where singleton_id
  union all
  select 2,'activation_state','tenant_flags_disabled',
    case when count(*)=0 then 'PASS' else 'FAIL' end,count(*)::text
  from public.core_v2_tenant_activation
  where enabled or canary_eligible or pos_enabled
     or admin_orders_enabled or quote_enabled
  union all
  select 3,'activation_state','branch_flags_disabled',
    case when count(*)=0 then 'PASS' else 'FAIL' end,count(*)::text
  from public.core_v2_branch_activation
  where enabled or canary_eligible or pos_enabled
     or admin_orders_enabled or quote_enabled
),
all_checks as (
  select item_order,category,check_name,result,observed from function_contract
  union all select 100+item_order,category,check_name,result,observed
    from unexpected_overloads
  union all select 200+item_order,category,check_name,result,observed
    from role_contract
  union all select 210+item_order,category,check_name,result,observed
    from membership_contract
  union all select 220+item_order,category,check_name,result,observed
    from atomic_entry_closure
  union all select 300+item_order,category,check_name,result,observed
    from acl_contract
  union all select 1000+item_order,category,check_name,result,observed
    from rls_contract
  union all select 1050+item_order,category,check_name,result,observed
    from table_acl_contract
  union all select 1100+item_order,category,check_name,result,observed
    from policy_contract
  union all select 1200+item_order,category,check_name,result,observed
    from unexpected_policy
  union all select 1300+item_order,category,check_name,result,observed
    from internal_table_closure
  union all select 1400+item_order,category,check_name,result,observed
    from schema_closure
  union all select 1500+item_order,category,check_name,result,observed
    from default_acl_contract
  union all select 1600+item_order,category,check_name,result,observed
    from default_acl_count
  union all select 1610+item_order,category,check_name,result,observed
    from public_default_function_acl
  union all select 1620+item_order,category,check_name,result,observed
    from shared_validator_contract
  union all select 1630+item_order,category,check_name,result,observed
    from shared_validator_acl
  union all select 1700+item_order,category,check_name,result,observed
    from activation_contract
)
select category,check_name,result,observed
from all_checks
order by item_order,category,check_name;
