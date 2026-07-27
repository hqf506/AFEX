/*
AFEX Core V2 Package 5R-B fail-closed rollback guard.

DO NOT EXECUTE without separate external approval.

Package 5R-B changes role existence/attributes, function definitions and
owners, schema/table/function/default privileges, RLS state, and policy
definitions. No authoritative before-state bundle is embedded here.
Automatic reversal could restore unsafe browser/service access or destroy a
valid pre-existing policy, owner, membership, or default ACL.
*/

begin;

do $package5rb_rollback_fail_closed$
declare
  v_role_count bigint;
  v_function_count bigint;
  v_policy_count bigint;
begin
  select count(*) into v_role_count
  from pg_roles
  where rolname in (
    'afex_core_owner','afex_context_issuer','afex_outbox_worker'
  );

  select count(*) into v_function_count
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname in (
      'issue_atomic_authorization_context_v1',
      'issue_pos_atomic_authorization_context_v1',
      'revoke_atomic_authorization_context_v1',
      'consume_atomic_authorization_context_v1',
      'claim_atomic_outbox_events_v1',
      'complete_atomic_outbox_event_v1',
      'fail_atomic_outbox_event_v1'
    );

  select count(*) into v_policy_count
  from pg_policies
  where schemaname='public'
    and policyname in (
      'context_issuer_insert_v1','context_issuer_revoke_v1',
      'context_issuer_read_v1','context_core_consume_v1',
      'financial_quotes_core_read_v1','idempotency_core_v1',
      'outbox_core_v1'
    );

  raise exception using
    message=format(
      'PACKAGE_5R_B_ROLLBACK_BLOCKED roles=%s functions=%s policies=%s',
      v_role_count,v_function_count,v_policy_count
    ),
    detail=
      'Authoritative before-state definitions, owners, ACLs, policies, default privileges, memberships, and role attributes are not embedded.',
    hint=
      'STOP. Use an externally reviewed forward fix based on retained pre-run evidence or approved full restoration.';
end;
$package5rb_rollback_fail_closed$;

rollback;

