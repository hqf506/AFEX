/*
AFEX Core V2 Package 5R-B pre-run verification.

STRICTLY READ ONLY. No DML, DDL, temporary objects, explicit/advisory locks,
configuration changes, or Package runtime-function invocation.
Local file hashes remain external evidence because PostgreSQL cannot read the
reviewed repository artifact.
*/

with
documented_hashes(artifact,expected_sha256) as (
  values
    (
      '04-atomic-core.sql',
      '40900e9e2bed32ef1f3064881081892719037924d19dfb9a6ff37f5d2feecfe7'
    ),
    (
      '05-security.sql',
      'df141eb3ad7c1ff9b9a2ca700a06b4493c524d671b384cf2c4d6a61b0fb569a3'
    )
),
expected_package4(function_name,identity_arguments) as (
  values
    ('resolve_atomic_authorization_v2','jsonb, jsonb'),
    ('normalize_customer_phone_v2','text'),
    ('resolve_customer_identity_v2','uuid, uuid, uuid, jsonb'),
    ('resolve_customer_identity_result_v2','uuid, uuid, uuid, jsonb'),
    ('build_atomic_request_fingerprint_v2','jsonb, jsonb'),
    (
      'acquire_idempotency_command_v2',
      'uuid, uuid, text, text, text, uuid, uuid, text, uuid'
    ),
    ('build_atomic_order_response_v1','uuid, uuid'),
    ('allocate_branch_monthly_number_v2','uuid, uuid, date'),
    ('assert_atomic_legacy_triggers_safe_v2',''),
    ('resolve_inventory_requirements_v2','uuid, uuid, jsonb'),
    ('lock_and_validate_inventory_v2','uuid, uuid, jsonb'),
    (
      'build_inventory_movement_evidence_v2',
      'uuid, uuid, uuid, uuid, uuid, uuid, uuid, numeric, numeric, numeric, bigint, bigint'
    ),
    (
      'apply_inventory_mutations_v2',
      'uuid, uuid, uuid, uuid, uuid, uuid, jsonb, jsonb'
    ),
    ('atomic_semantic_event_uuid_v1','text'),
    (
      'enqueue_atomic_outbox_v2',
      'uuid, uuid, uuid, uuid, uuid, boolean, text, text, numeric, text, text, text, jsonb, uuid, timestamp with time zone'
    ),
    ('derive_atomic_financial_snapshot_v2','uuid, uuid, jsonb'),
    ('create_order_atomic_v2','jsonb, jsonb, jsonb, jsonb')
),
actual_package4 as (
  select
    p.oid,p.proname,
    pg_get_function_identity_arguments(p.oid) identity_arguments,
    owner_role.rolname owner_name,p.prosecdef,p.proconfig
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  join pg_roles owner_role on owner_role.oid=p.proowner
  where n.nspname='public'
    and p.proname in (select function_name from expected_package4)
),
signature_checks as (
  select
    row_number() over (order by e.function_name) item_order,
    'package4_signature'::text category,
    e.function_name || '(' || e.identity_arguments || ')' check_name,
    case when count(a.oid)=1 then 'PASS' else 'FAIL' end result,
    count(a.oid)::text observed
  from expected_package4 e
  left join actual_package4 a
    on a.proname=e.function_name
   and a.identity_arguments=e.identity_arguments
  group by e.function_name,e.identity_arguments
),
overload_check as (
  select
    1 item_order,'package4_overload'::text category,
    'unexpected_package4_overloads'::text check_name,
    case when count(*)=0 then 'PASS' else 'FAIL' end result,
    count(*)::text observed
  from actual_package4 a
  left join expected_package4 e
    on e.function_name=a.proname
   and e.identity_arguments=a.identity_arguments
  where e.function_name is null
),
stale_functions(signature) as (values
  ('validate_and_apply_inventory_v2'),
  ('enqueue_atomic_outbox_v1')
),
stale_checks as (
  select
    row_number() over (order by signature) item_order,
    'stale_function'::text category,signature check_name,
    case when (
      select count(*)
      from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname=s.signature
    )=0 then 'PASS' else 'FAIL' end result,
    (
      select count(*)::text
      from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname=s.signature
    ) observed
  from stale_functions s
),
required_relations(object_name,relkind) as (values
  ('atomic_authorization_contexts','r'),
  ('financial_quotes','r'),
  ('idempotency_commands','r'),
  ('atomic_outbox','r'),
  ('profiles','r'),('pos_profiles','r'),('tenants','r'),('branches','r'),
  ('customers','r'),('orders','r'),('invoices','r'),('invoice_items','r'),
  ('inventory_stock','r'),('inventory_movements','r'),('audit_logs','r'),
  ('order_number_sequences','r'),('catalog_items','r'),
  ('branch_catalog_items','r'),('discounts','r'),('vat_settings','r'),
  ('core_v2_activation_control','r'),
  ('core_v2_tenant_activation','r'),
  ('core_v2_branch_activation','r')
),
relation_checks as (
  select
    row_number() over (order by r.object_name) item_order,
    'required_relation'::text category,r.object_name check_name,
    case when count(c.oid)=1 and bool_and(c.relkind=r.relkind)
      then 'PASS' else 'FAIL' end result,
    coalesce(string_agg(c.relkind::text,','),'MISSING') observed
  from required_relations r
  left join pg_namespace n on n.nspname='public'
  left join pg_class c
    on c.relnamespace=n.oid and c.relname=r.object_name
  group by r.object_name,r.relkind
),
required_columns(table_name,column_name,type_name) as (values
  ('atomic_authorization_contexts','context_id','uuid'),
  ('atomic_authorization_contexts','context_token_hash','text'),
  ('atomic_authorization_contexts','authenticated_user_id','uuid'),
  ('atomic_authorization_contexts','tenant_id','uuid'),
  ('atomic_authorization_contexts','branch_id','uuid'),
  ('atomic_authorization_contexts','state','text'),
  ('atomic_authorization_contexts','purpose','text'),
  ('atomic_authorization_contexts','context_version','text'),
  ('atomic_authorization_contexts','idempotency_key_hash','text'),
  ('atomic_authorization_contexts','expires_at','timestamp with time zone'),
  ('financial_quotes','authorization_context_id','uuid'),
  ('idempotency_commands','key_hash','text'),
  ('atomic_outbox','event_id','uuid'),
  ('atomic_outbox','execution_status','text'),
  ('atomic_outbox','lease_owner','text'),
  ('atomic_outbox','lease_expires_at','timestamp with time zone')
),
column_checks as (
  select
    row_number() over (order by e.table_name,e.column_name) item_order,
    'required_column'::text category,
    e.table_name || '.' || e.column_name check_name,
    case when c.column_name is not null and c.data_type=e.type_name
      then 'PASS' else 'FAIL' end result,
    coalesce(c.data_type,'MISSING') observed
  from required_columns e
  left join information_schema.columns c
    on c.table_schema='public'
   and c.table_name=e.table_name
   and c.column_name=e.column_name
),
required_indexes(index_name) as (values
  ('idx_atomic_authorization_contexts_state_expiry'),
  ('idx_atomic_authorization_contexts_actor_history'),
  ('idx_atomic_authorization_contexts_scope_history'),
  ('uq_financial_quotes_authorization_context')
),
index_checks as (
  select
    row_number() over (order by e.index_name) item_order,
    'required_index'::text category,e.index_name check_name,
    case when count(c.oid)=1
                   and bool_and(i.indisvalid and i.indisready)
      then 'PASS' else 'FAIL' end result,
    count(c.oid)::text observed
  from required_indexes e
  left join pg_namespace n on n.nspname='public'
  left join pg_class c on c.relnamespace=n.oid and c.relname=e.index_name
  left join pg_index i on i.indexrelid=c.oid
  group by e.index_name
),
required_constraints(table_name,constraint_name) as (values
  (
    'atomic_authorization_contexts',
    'ck_atomic_authorization_contexts_actor_identity'
  ),
  (
    'financial_quotes',
    'fk_financial_quotes_authorization_context'
  )
),
constraint_checks as (
  select
    row_number() over (order by e.table_name,e.constraint_name) item_order,
    'required_constraint'::text category,e.constraint_name check_name,
    case when count(c.oid)=1 and bool_and(c.convalidated)
      then 'PASS' else 'FAIL' end result,
    count(c.oid)::text observed
  from required_constraints e
  left join pg_namespace n on n.nspname='public'
  left join pg_class t on t.relnamespace=n.oid and t.relname=e.table_name
  left join pg_constraint c
    on c.conrelid=t.oid and c.conname=e.constraint_name
  group by e.table_name,e.constraint_name
),
required_dependencies(signature) as (values
  ('public.verify_pos_pin_for_actor(text,uuid,uuid)'),
  ('public.validate_atomic_authorization_context_internal_v1(text,text,text,uuid)'),
  ('extensions.digest(text,text)'),
  ('extensions.gen_random_bytes(integer)')
),
dependency_checks as (
  select
    row_number() over (order by signature) item_order,
    'required_dependency'::text category,signature check_name,
    case when to_regprocedure(signature) is not null
      then 'PASS' else 'FAIL' end result,
    coalesce(to_regprocedure(signature)::text,'MISSING') observed
  from required_dependencies
),
required_roles(role_name,must_be_dedicated) as (values
  ('anon',false),('authenticated',false),('service_role',false),
  ('afex_core_runtime',false),('afex_core_activation_operator',false),
  ('afex_core_owner',true),('afex_context_issuer',true),
  ('afex_outbox_worker',true)
),
role_checks as (
  select
    row_number() over (order by e.role_name) item_order,
    'required_role'::text category,e.role_name check_name,
    case
      when r.oid is null and e.must_be_dedicated then 'CREATE_REQUIRED'
      when r.oid is null then 'FAIL'
      when not e.must_be_dedicated then 'PASS'
      when not r.rolcanlogin and not r.rolsuper and not r.rolcreatedb
       and not r.rolcreaterole and not r.rolinherit
       and not r.rolreplication and not r.rolbypassrls
      then 'PASS' else 'FAIL'
    end result,
    case when r.oid is null then 'MISSING' else format(
      'login=%s super=%s createdb=%s createrole=%s inherit=%s replication=%s bypassrls=%s',
      r.rolcanlogin,r.rolsuper,r.rolcreatedb,r.rolcreaterole,r.rolinherit,
      r.rolreplication,r.rolbypassrls
    ) end observed
  from required_roles e left join pg_roles r on r.rolname=e.role_name
),
unsafe_membership as (
  select
    1 item_order,'role_membership'::text category,
    'dedicated_role_membership_count'::text check_name,
    case when count(*)=0 then 'PASS' else 'FAIL' end result,
    count(*)::text observed
  from pg_auth_members m
  join pg_roles granted_role on granted_role.oid=m.roleid
  where granted_role.rolname in (
    'afex_core_owner','afex_context_issuer','afex_outbox_worker'
  )
),
membership_details as (
  select
    row_number() over (
      order by granted_role.rolname,member_role.rolname
    ) item_order,
    'role_membership_detail'::text category,
    member_role.rolname || '->' || granted_role.rolname check_name,
    'FAIL'::text result,
    format(
      'member=%s granted_role=%s admin_option=%s inherit_option=%s set_option=%s',
      member_role.rolname,
      granted_role.rolname,
      m.admin_option,
      m.inherit_option,
      m.set_option
    ) observed
  from pg_auth_members m
  join pg_roles member_role on member_role.oid=m.member
  join pg_roles granted_role on granted_role.oid=m.roleid
  where granted_role.rolname in (
    'afex_core_owner','afex_context_issuer','afex_outbox_worker'
  )
),
activation_checks as (
  select
    1 item_order,'activation_state'::text category,
    'global_flags_disabled'::text check_name,
    case when count(*)=1 and bool_and(
      not global_enabled and kill_switch and not pos_enabled
      and not admin_orders_enabled and not quote_issuer_enabled
      and not outbox_worker_enabled and deterministic_canary_percentage=0
    ) then 'PASS' else 'FAIL' end result,
    count(*)::text observed
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
reviewed_roles(role_name) as (values
  ('PUBLIC'),('anon'),('authenticated'),('service_role'),
  ('afex_core_runtime'),('afex_context_issuer'),('afex_outbox_worker'),
  ('afex_core_activation_operator')
),
atomic_acl_checks as (
  select
    row_number() over (order by role_name) item_order,
    'atomic_entry_acl'::text category,role_name check_name,
    case
      when to_regrole(role_name) is null and role_name<>'PUBLIC' then 'FAIL'
      when not has_function_privilege(
        role_name,
        'public.create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)',
        'EXECUTE'
      ) then 'PASS' else 'FAIL'
    end result,
    case
      when to_regrole(role_name) is null and role_name<>'PUBLIC'
        then 'ROLE_MISSING'
      else has_function_privilege(
        role_name,
        'public.create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)',
        'EXECUTE'
      )::text
    end observed
  from reviewed_roles
),
owner_capture as (
  select
    row_number() over (order by a.proname,a.identity_arguments) item_order,
    'pre_owner_state'::text category,
    a.proname || '(' || a.identity_arguments || ')' check_name,
    case when a.owner_name in (
      'postgres','supabase_admin','afex_core_owner'
    ) then 'PASS' else 'FAIL' end result,
    a.owner_name observed
  from actual_package4 a
),
acl_capture as (
  select
    row_number() over (
      order by a.proname,a.identity_arguments,r.role_name
    ) item_order,
    'pre_acl_state'::text category,
    a.proname || '(' || a.identity_arguments || '):' || r.role_name check_name,
    'REVIEW_REQUIRED'::text result,
    case
      when to_regrole(r.role_name) is null and r.role_name<>'PUBLIC'
        then 'ROLE_MISSING'
      else has_function_privilege(r.role_name,a.oid,'EXECUTE')::text
    end observed
  from actual_package4 a cross join reviewed_roles r
),
hash_rows as (
  select
    row_number() over (order by artifact) item_order,
    'documented_hash'::text category,artifact check_name,
    'EXTERNAL_EVIDENCE_REQUIRED'::text result,expected_sha256 observed
  from documented_hashes
),
all_checks as (
  select item_order,category,check_name,result,observed from hash_rows
  union all select 100+item_order,category,check_name,result,observed
    from signature_checks
  union all select 200+item_order,category,check_name,result,observed
    from overload_check
  union all select 210+item_order,category,check_name,result,observed
    from stale_checks
  union all select 300+item_order,category,check_name,result,observed
    from relation_checks
  union all select 400+item_order,category,check_name,result,observed
    from column_checks
  union all select 500+item_order,category,check_name,result,observed
    from index_checks
  union all select 600+item_order,category,check_name,result,observed
    from constraint_checks
  union all select 700+item_order,category,check_name,result,observed
    from dependency_checks
  union all select 800+item_order,category,check_name,result,observed
    from role_checks
  union all select 900+item_order,category,check_name,result,observed
    from unsafe_membership
  union all select 910+item_order,category,check_name,result,observed
    from membership_details
  union all select 1000+item_order,category,check_name,result,observed
    from activation_checks
  union all select 1100+item_order,category,check_name,result,observed
    from atomic_acl_checks
  union all select 1200+item_order,category,check_name,result,observed
    from owner_capture
  union all select 1300+item_order,category,check_name,result,observed
    from acl_capture
)
select category,check_name,result,observed
from all_checks
order by item_order,category,check_name;
