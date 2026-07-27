/*
AFEX Core V2 Package 3R fail-closed rollback guard.

DO NOT EXECUTE without separate external approval.

Package 3R commits bounded updates without persisting authoritative per-row
before-images or a reviewed list of rows changed by each batch. Current values
alone cannot distinguish Package 3R writes from legitimate concurrent or later
application writes. An automatic UPDATE-to-NULL rollback would risk data loss.

This artifact therefore fails closed and performs no data or schema mutation.
Recovery must use:
  1. rollback of the currently active, not-yet-committed batch;
  2. a separately reviewed forward fix based on exact retained evidence; or
  3. full database restoration under approved backup authority.
*/

begin;

do $package3r_rollback_fail_closed$
declare
  v_customer_normalized bigint;
  v_customer_versions bigint;
  v_inventory_versions bigint;
  v_index_present boolean;
begin
  select count(*) into v_customer_normalized
  from public.customers
  where phone_normalized is not null;

  select count(*) into v_customer_versions
  from public.customers
  where record_version is not null;

  select count(*) into v_inventory_versions
  from public.inventory_stock
  where record_version is not null;

  select exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'uq_customers_tenant_phone_normalized'
  ) into v_index_present;

  raise exception using
    message = format(
      'PACKAGE_3R_ROLLBACK_BLOCKED normalized_customers=%s versioned_customers=%s versioned_inventory_rows=%s canonical_index_present=%s',
      v_customer_normalized,
      v_customer_versions,
      v_inventory_versions,
      v_index_present
    ),
    detail =
      'No authoritative Package 3R per-row before-image manifest exists. No automatic reversal is safe.',
    hint =
      'STOP. Preserve evidence and request an externally reviewed forward fix or approved full restoration.';
end;
$package3r_rollback_fail_closed$;

rollback;

