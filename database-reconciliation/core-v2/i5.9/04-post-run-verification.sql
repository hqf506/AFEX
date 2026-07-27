/*
AFEX Core V2 Package 4T post-run verification.

READ ONLY. Produces reviewable metadata and static-contract results.
No DML, DDL, temporary objects, explicit locks, advisory locks, function
invocation, or configuration changes.
*/

with
expected_functions(
  function_name,
  identity_arguments,
  security_definer,
  expected_owner
) as (
  values
    ('resolve_atomic_authorization_v2','jsonb, jsonb',true,'afex_core_owner'),
    ('normalize_customer_phone_v2','text',false,'afex_core_owner'),
    (
      'resolve_customer_identity_v2',
      'uuid, uuid, uuid, jsonb',
      true,
      'afex_core_owner'
    ),
    (
      'resolve_customer_identity_result_v2',
      'uuid, uuid, uuid, jsonb',
      true,
      'afex_core_owner'
    ),
    (
      'build_atomic_request_fingerprint_v2',
      'jsonb, jsonb',
      false,
      'afex_core_owner'
    ),
    (
      'acquire_idempotency_command_v2',
      'uuid, uuid, text, text, text, uuid, uuid, text, uuid',
      true,
      'afex_core_owner'
    ),
    (
      'build_atomic_order_response_v1',
      'uuid, uuid',
      true,
      'afex_core_owner'
    ),
    (
      'allocate_branch_monthly_number_v2',
      'uuid, uuid, date',
      true,
      'afex_core_owner'
    ),
    (
      'assert_atomic_legacy_triggers_safe_v2',
      '',
      true,
      'afex_core_owner'
    ),
    (
      'resolve_inventory_requirements_v2',
      'uuid, uuid, jsonb',
      true,
      'afex_core_owner'
    ),
    (
      'lock_and_validate_inventory_v2',
      'uuid, uuid, jsonb',
      true,
      'afex_core_owner'
    ),
    (
      'build_inventory_movement_evidence_v2',
      'uuid, uuid, uuid, uuid, uuid, uuid, uuid, numeric, numeric, numeric, bigint, bigint',
      false,
      'afex_core_owner'
    ),
    (
      'apply_inventory_mutations_v2',
      'uuid, uuid, uuid, uuid, uuid, uuid, jsonb, jsonb',
      true,
      'afex_core_owner'
    ),
    (
      'atomic_semantic_event_uuid_v1',
      'text',
      false,
      'afex_core_owner'
    ),
    (
      'enqueue_atomic_outbox_v2',
      'uuid, uuid, uuid, uuid, uuid, boolean, text, text, numeric, text, text, text, jsonb, uuid, timestamp with time zone',
      true,
      'afex_core_owner'
    ),
    (
      'derive_atomic_financial_snapshot_v2',
      'uuid, uuid, jsonb',
      true,
      'afex_core_owner'
    ),
    (
      'create_order_atomic_v2',
      'jsonb, jsonb, jsonb, jsonb',
      true,
      'afex_core_owner'
    )
),
actual_functions as (
  select
    p.oid,
    p.proname as function_name,
    pg_get_function_identity_arguments(p.oid) as identity_arguments,
    p.prosecdef as security_definer,
    owner_role.rolname as owner_name,
    p.proconfig,
    pg_get_functiondef(p.oid) as body
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_roles owner_role on owner_role.oid = p.proowner
  where n.nspname = 'public'
    and p.proname in (select function_name from expected_functions)
),
signature_checks as (
  select
    row_number() over (order by e.function_name) as item_order,
    'function_contract'::text as category,
    e.function_name || '(' || e.identity_arguments || ')' as check_name,
    case when count(a.oid) = 1
                   and bool_and(a.security_definer = e.security_definer)
                   and bool_and(a.proconfig @> array['search_path=pg_catalog'])
      then 'PASS' else 'FAIL' end as result,
    format(
      'count=%s security_definer=%s safe_search_path=%s',
      count(a.oid),
      coalesce(bool_and(a.security_definer = e.security_definer)::text,'false'),
      coalesce(
        bool_and(a.proconfig @> array['search_path=pg_catalog'])::text,
        'false'
      )
    ) as observed
  from expected_functions e
  left join actual_functions a
    on a.function_name = e.function_name
   and a.identity_arguments = e.identity_arguments
  group by e.function_name,e.identity_arguments,e.security_definer
),
owner_checks as (
  select
    row_number() over (order by e.function_name) as item_order,
    'function_owner'::text as category,
    e.function_name || '(' || e.identity_arguments || ')' as check_name,
    case when count(a.oid) = 1
                   and bool_and(a.owner_name = e.expected_owner)
      then 'PASS' else 'FAIL' end as result,
    coalesce(string_agg(a.owner_name,',' order by a.owner_name),'MISSING')
      as observed
  from expected_functions e
  left join actual_functions a
    on a.function_name = e.function_name
   and a.identity_arguments = e.identity_arguments
  group by e.function_name,e.identity_arguments,e.expected_owner
),
unexpected_overloads as (
  select
    100 as item_order,
    'function_contract'::text as category,
    'unexpected_atomic_overloads'::text as check_name,
    case when count(*) = 0 then 'PASS' else 'FAIL' end as result,
    count(*)::text as observed
  from actual_functions a
  left join expected_functions e
    on e.function_name = a.function_name
   and e.identity_arguments = a.identity_arguments
  where e.function_name is null
),
definition as (
  select body
  from actual_functions
  where function_name = 'create_order_atomic_v2'
    and identity_arguments = 'jsonb, jsonb, jsonb, jsonb'
),
ordering_positions as (
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
),
static_checks as (
  select 1 as item_order,'static_contract'::text as category,
    'replay_precedes_quote'::text as check_name,
    case when replay_position > 0 and replay_position < quote_position
      then 'PASS' else 'FAIL' end as result,
    format('%s < %s',replay_position,quote_position) as observed
  from ordering_positions
  union all
  select 2,'static_contract','quote_precedes_derivation',
    case when quote_position < derivation_position then 'PASS' else 'FAIL' end,
    format('%s < %s',quote_position,derivation_position)
  from ordering_positions
  union all
  select 3,'static_contract','derivation_precedes_parity',
    case when derivation_position < parity_position then 'PASS' else 'FAIL' end,
    format('%s < %s',derivation_position,parity_position)
  from ordering_positions
  union all
  select 4,'static_contract','parity_precedes_inventory',
    case when parity_position < inventory_position then 'PASS' else 'FAIL' end,
    format('%s < %s',parity_position,inventory_position)
  from ordering_positions
  union all
  select 5,'static_contract','parity_precedes_numbering',
    case when parity_position < numbering_position then 'PASS' else 'FAIL' end,
    format('%s < %s',parity_position,numbering_position)
  from ordering_positions
  union all
  select 6,'static_contract','parity_precedes_persistence',
    case when parity_position < persistence_position then 'PASS' else 'FAIL' end,
    format('%s < %s',parity_position,persistence_position)
  from ordering_positions
  union all
  select 7,'static_contract','no_broad_exception_handler',
    case when body not like '%when others%' then 'PASS' else 'FAIL' end,
    (body not like '%when others%')::text
  from ordering_positions
),
runtime_roles(role_name) as (values
  ('PUBLIC'),('anon'),('authenticated'),('service_role'),
  ('afex_core_runtime'),('afex_context_issuer'),('afex_outbox_worker'),
  ('afex_core_activation_operator')
),
acl_checks as (
  select
    row_number() over (
      order by e.function_name,e.identity_arguments,r.role_name
    ) as item_order,
    'acl'::text as category,
    e.function_name || '(' || e.identity_arguments || ')_execute_closed_for_'
      || r.role_name as check_name,
    case
      when a.oid is null then 'FAIL'
      when to_regrole(r.role_name) is null and r.role_name <> 'PUBLIC'
        then 'FAIL'
      when not has_function_privilege(
        r.role_name,
        a.oid,
        'EXECUTE'
      ) then 'PASS'
      else 'FAIL'
    end as result,
    case
      when a.oid is null then 'FUNCTION_MISSING'
      when to_regrole(r.role_name) is null and r.role_name <> 'PUBLIC'
        then 'ROLE_MISSING'
      else has_function_privilege(
        r.role_name,
        a.oid,
        'EXECUTE'
      )::text
    end as observed
  from expected_functions e
  cross join runtime_roles r
  left join actual_functions a
    on a.function_name = e.function_name
   and a.identity_arguments = e.identity_arguments
),
legacy_helper_check as (
  select
    1 as item_order,
    'legacy_contract'::text as category,
    'enqueue_atomic_outbox_v1_removed'::text as check_name,
    case when to_regprocedure(
      'public.enqueue_atomic_outbox_v1(uuid,uuid,uuid,uuid,uuid,jsonb)'
    ) is null then 'PASS' else 'FAIL' end as result,
    coalesce(
      to_regprocedure(
        'public.enqueue_atomic_outbox_v1(uuid,uuid,uuid,uuid,uuid,jsonb)'
      )::text,
      'ABSENT'
    ) as observed
),
all_checks as (
  select item_order,category,check_name,result,observed
  from signature_checks
  union all select * from unexpected_overloads
  union all
  select 150 + item_order,category,check_name,result,observed
  from owner_checks
  union all
  select 200 + item_order,category,check_name,result,observed
  from static_checks
  union all
  select 300 + item_order,category,check_name,result,observed
  from acl_checks
  union all
  select 400 + item_order,category,check_name,result,observed
  from legacy_helper_check
)
select category,check_name,result,observed
from all_checks
order by item_order,category,check_name;
