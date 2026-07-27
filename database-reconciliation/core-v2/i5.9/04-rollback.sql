/*
AFEX Core V2 Package 4T conservative rollback guard.

DO NOT EXECUTE without separate external approval.

Package 4T uses CREATE OR REPLACE FUNCTION and removes the obsolete
enqueue_atomic_outbox_v1 overload. The package does not retain authoritative
before-definitions for every replaced function and cannot reconstruct the
removed overload safely. Dropping current functions may also break Package 5,
Package 6, or deployed application dependencies.

This rollback therefore fails closed and performs no schema or data mutation.
Recovery requires an externally reviewed forward fix built from retained
pre-execution definitions, or approved full restoration.
*/

begin;

do $package4t_rollback_fail_closed$
declare
  v_expected_function_count bigint;
  v_runtime_execute_count bigint;
  v_atomic_rows bigint;
begin
  select count(*)
  into v_expected_function_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'resolve_atomic_authorization_v2',
      'normalize_customer_phone_v2',
      'resolve_customer_identity_v2',
      'resolve_customer_identity_result_v2',
      'build_atomic_request_fingerprint_v2',
      'acquire_idempotency_command_v2',
      'build_atomic_order_response_v1',
      'allocate_branch_monthly_number_v2',
      'assert_atomic_legacy_triggers_safe_v2',
      'resolve_inventory_requirements_v2',
      'lock_and_validate_inventory_v2',
      'build_inventory_movement_evidence_v2',
      'apply_inventory_mutations_v2',
      'atomic_semantic_event_uuid_v1',
      'enqueue_atomic_outbox_v2',
      'derive_atomic_financial_snapshot_v2',
      'create_order_atomic_v2'
    );

  select count(*)
  into v_runtime_execute_count
  from (values
    ('PUBLIC'),('anon'),('authenticated'),('service_role'),
    ('afex_core_runtime'),('afex_context_issuer'),('afex_outbox_worker'),
    ('afex_core_activation_operator')
  ) roles(role_name)
  where (to_regrole(role_name) is not null or role_name = 'PUBLIC')
    and to_regprocedure(
      'public.create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)'
    ) is not null
    and has_function_privilege(
      role_name,
      'public.create_order_atomic_v2(jsonb,jsonb,jsonb,jsonb)',
      'EXECUTE'
    );

  select
    (select count(*) from public.idempotency_commands
      where engine_version = 'v2')
    + (select count(*) from public.orders
      where atomic_engine_version = 'atomic-order-v2-r1')
    + (select count(*) from public.invoices
      where atomic_engine_version = 'atomic-order-v2-r1')
  into v_atomic_rows;

  raise exception using
    message = format(
      'PACKAGE_4T_ROLLBACK_BLOCKED functions=%s runtime_execute_grants=%s atomic_rows=%s',
      v_expected_function_count,
      v_runtime_execute_count,
      v_atomic_rows
    ),
    detail =
      'Package 4T replaced definitions and removed a legacy overload without embedding authoritative before-definitions. Automatic reversal is unsafe.',
    hint =
      'STOP. Preserve evidence and request an externally reviewed forward fix or approved full restoration.';
end;
$package4t_rollback_fail_closed$;

rollback;

