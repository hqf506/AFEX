/*
AFEX Core V2 I5.9 — Package 3R: Evidence-Only Backfill Hardening

PURPOSE
-------
Prepare customer normalized identity and record-version foundations without
inventing historical order, invoice, invoice-item, financial, cost, inventory,
actor, rule, source or correlation evidence.

OPERATOR CONTRACT
-----------------
1. Execute sections manually and in order.
2. Section A is read-only evidence followed by a hard abort gate.
3. Sections B, C and D each update at most 1,000 rows and commit independently.
   Re-run one section until its returned updated_count is zero.
4. Section E is read-only progress verification.
5. Execute Section G only when Section F reports CREATE_REQUIRED.
6. Run Section H after any Section G attempt.
7. Run each Section I validation separately and only during an approved window.
8. Never continue after an exception or non-zero blocker result.

BOUNDARY
--------
No historical snapshot backfill is included intentionally: no candidate field
met the evidence-only requirements without relying on mutable data, arithmetic
reconstruction or unsupported classification.

Package 2/2B dependencies:
  ck_customers_phone_normalized
  ck_customers_record_version
  ck_inventory_stock_record_version
  idx_customers_tenant_phone_normalized

Package 3 canonical identity index:
  uq_customers_tenant_phone_normalized

No SQL in this file has been executed by the generation/review process.
*/

/* ========================================================================== */
/* SECTION A — READ-ONLY BLOCKERS AND RESTRICTED ADMINISTRATIVE EVIDENCE       */
/* ========================================================================== */

-- A1. Invalid non-empty phones. Empty phones are intentionally not invalid.
with normalized as (
  select
    c.id,
    c.tenant_id,
    c.phone,
    case
      when x.compact_phone ~ '^05[0-9]{8}$'
        then '966' || substring(x.compact_phone from 2)
      when x.compact_phone ~ '^5[0-9]{8}$'
        then '966' || x.compact_phone
      when x.compact_phone ~ '^\+9665[0-9]{8}$'
        then substring(x.compact_phone from 2)
      when x.compact_phone ~ '^9665[0-9]{8}$'
        then x.compact_phone
      else null
    end as derived_phone_normalized
  from public.customers c
  cross join lateral (
    select regexp_replace(
      translate(
        coalesce(c.phone, ''),
        '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
        '01234567890123456789'
      ),
      '[\s\-\(\)]',
      '',
      'g'
    ) as compact_phone
  ) x
)
select
  'RESTRICTED_ADMIN_EVIDENCE'::text as evidence_classification,
  'INVALID_NONEMPTY_PHONE'::text as evidence_type,
  id as customer_id,
  tenant_id,
  phone as raw_phone
from normalized
where nullif(btrim(coalesce(phone, '')), '') is not null
  and derived_phone_normalized is null
order by tenant_id, id;

-- A2. Customers missing tenant identity.
select
  'RESTRICTED_ADMIN_EVIDENCE'::text as evidence_classification,
  'MISSING_CUSTOMER_TENANT'::text as evidence_type,
  c.id as customer_id
from public.customers c
where c.tenant_id is null
order by c.id;

-- A3. Populated normalized values conflicting with the canonical raw phone.
with normalized as (
  select
    c.id,
    c.tenant_id,
    c.phone,
    c.phone_normalized,
    case
      when x.compact_phone ~ '^05[0-9]{8}$'
        then '966' || substring(x.compact_phone from 2)
      when x.compact_phone ~ '^5[0-9]{8}$'
        then '966' || x.compact_phone
      when x.compact_phone ~ '^\+9665[0-9]{8}$'
        then substring(x.compact_phone from 2)
      when x.compact_phone ~ '^9665[0-9]{8}$'
        then x.compact_phone
      else null
    end as derived_phone_normalized
  from public.customers c
  cross join lateral (
    select regexp_replace(
      translate(
        coalesce(c.phone, ''),
        '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
        '01234567890123456789'
      ),
      '[\s\-\(\)]',
      '',
      'g'
    ) as compact_phone
  ) x
)
select
  'RESTRICTED_ADMIN_EVIDENCE'::text as evidence_classification,
  'NORMALIZED_VALUE_CONFLICT'::text as evidence_type,
  id as customer_id,
  tenant_id,
  phone as raw_phone,
  phone_normalized as existing_normalized_value,
  derived_phone_normalized as derived_normalized_value
from normalized
where phone_normalized is not null
  and phone_normalized is distinct from derived_phone_normalized
order by tenant_id, id;

-- A4. Duplicate canonical identities derived from raw phone values.
with normalized as (
  select
    c.id,
    c.tenant_id,
    c.phone,
    case
      when x.compact_phone ~ '^05[0-9]{8}$'
        then '966' || substring(x.compact_phone from 2)
      when x.compact_phone ~ '^5[0-9]{8}$'
        then '966' || x.compact_phone
      when x.compact_phone ~ '^\+9665[0-9]{8}$'
        then substring(x.compact_phone from 2)
      when x.compact_phone ~ '^9665[0-9]{8}$'
        then x.compact_phone
      else null
    end as derived_phone_normalized
  from public.customers c
  cross join lateral (
    select regexp_replace(
      translate(
        coalesce(c.phone, ''),
        '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
        '01234567890123456789'
      ),
      '[\s\-\(\)]',
      '',
      'g'
    ) as compact_phone
  ) x
)
select
  'RESTRICTED_ADMIN_EVIDENCE'::text as evidence_classification,
  'DUPLICATE_CANONICAL_IDENTITY'::text as evidence_type,
  tenant_id,
  derived_phone_normalized as canonical_phone_normalized,
  array_agg(id order by id) as customer_ids,
  array_agg(phone order by id) as raw_phone_representations
from normalized
where tenant_id is not null
  and derived_phone_normalized is not null
group by tenant_id, derived_phone_normalized
having count(*) > 1
order by tenant_id, derived_phone_normalized;

-- A5. Duplicate existing normalized identities.
select
  'RESTRICTED_ADMIN_EVIDENCE'::text as evidence_classification,
  'DUPLICATE_EXISTING_NORMALIZED_IDENTITY'::text as evidence_type,
  c.tenant_id,
  c.phone_normalized as canonical_phone_normalized,
  array_agg(c.id order by c.id) as customer_ids,
  array_agg(c.phone order by c.id) as raw_phone_representations
from public.customers c
where c.tenant_id is not null
  and c.phone_normalized is not null
group by c.tenant_id, c.phone_normalized
having count(*) > 1
order by c.tenant_id, c.phone_normalized;

-- A6. Invalid customer record versions.
select
  'RESTRICTED_ADMIN_EVIDENCE'::text as evidence_classification,
  'INVALID_CUSTOMER_RECORD_VERSION'::text as evidence_type,
  c.id as customer_id,
  c.tenant_id,
  c.record_version
from public.customers c
where c.record_version < 1
order by c.tenant_id, c.id;

-- A7. Invalid inventory record versions. No quantities are exposed.
select
  'RESTRICTED_ADMIN_EVIDENCE'::text as evidence_classification,
  'INVALID_INVENTORY_RECORD_VERSION'::text as evidence_type,
  s.id as inventory_stock_id,
  s.tenant_id,
  s.branch_id,
  s.record_version
from public.inventory_stock s
where s.record_version < 1
order by s.tenant_id, s.branch_id, s.id;

-- A8. Unexpected Core V2 markers before activation.
select *
from (
  select
    'RESTRICTED_ADMIN_EVIDENCE'::text as evidence_classification,
    'UNEXPECTED_ORDER_ATOMIC_MARKER'::text as evidence_type,
    o.id as record_id,
    o.tenant_id,
    o.branch_id,
    o.atomic_engine_version as marker
  from public.orders o
  where o.atomic_engine_version = 'atomic-order-v2-r1'

  union all

  select
    'RESTRICTED_ADMIN_EVIDENCE',
    'UNEXPECTED_INVOICE_ATOMIC_MARKER',
    i.id,
    i.tenant_id,
    i.branch_id,
    i.atomic_engine_version
  from public.invoices i
  where i.atomic_engine_version = 'atomic-order-v2-r1'

  union all

  select
    'RESTRICTED_ADMIN_EVIDENCE',
    'UNEXPECTED_INVOICE_FINANCIAL_MARKER',
    i.id,
    i.tenant_id,
    i.branch_id,
    i.financial_engine_version
  from public.invoices i
  where i.financial_engine_version = 'financial-engine-v2-r1'

  union all

  select
    'RESTRICTED_ADMIN_EVIDENCE',
    'UNEXPECTED_INVENTORY_MARKER',
    m.id,
    m.tenant_id,
    m.branch_id,
    m.inventory_engine_version
  from public.inventory_movements m
  where m.inventory_engine_version = 'inventory-engine-v2-r1'
) unexpected_core_v2
order by evidence_type, tenant_id, branch_id, record_id;

-- A9. Existing canonical unique-index artifact details.
select
  'RESTRICTED_ADMIN_EVIDENCE'::text as evidence_classification,
  'CUSTOMER_UNIQUE_INDEX_ARTIFACT'::text as evidence_type,
  n.nspname as schema_name,
  c.relname as index_name,
  t.relname as target_table,
  i.indisunique,
  i.indisvalid,
  i.indisready,
  pg_get_indexdef(i.indexrelid) as index_definition,
  pg_get_expr(i.indpred, i.indrelid) as index_predicate
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_index i on i.indexrelid = c.oid
left join pg_class t on t.oid = i.indrelid
where n.nspname = 'public'
  and c.relname = 'uq_customers_tenant_phone_normalized';

-- A10. Hard gate. It verifies Package 2 schema/constraint presence and every
-- blocker above before any mutation section may be run.
do $package3r_pre_mutation_gate$
declare
  r record;
  v_type text;
  v_not_null boolean;
  v_invalid bigint;
  v_missing_tenant bigint;
  v_conflicts bigint;
  v_derived_duplicates bigint;
  v_existing_duplicates bigint;
  v_bad_customer_versions bigint;
  v_bad_inventory_versions bigint;
  v_unexpected_markers bigint;
  v_index_count bigint;
  v_index_ok boolean;
begin
  -- Required Package 2 columns must exist with exact nullable types.
  for r in
    select *
    from (values
      ('customers','phone_normalized','text'),
      ('customers','record_version','bigint'),
      ('inventory_stock','record_version','bigint')
    ) expected(table_name,column_name,type_name)
  loop
    select format_type(a.atttypid,a.atttypmod), a.attnotnull
    into v_type,v_not_null
    from pg_attribute a
    where a.attrelid = format('public.%I',r.table_name)::regclass
      and a.attname = r.column_name
      and a.attnum > 0
      and not a.attisdropped;

    if not found or v_type <> r.type_name or v_not_null then
      raise exception
        'PACKAGE_2_SCHEMA_DRIFT: %.% expected nullable %, found type %, not_null %',
        r.table_name,r.column_name,r.type_name,coalesce(v_type,'MISSING'),v_not_null;
    end if;
  end loop;

  -- Canonical Package 2 checks must exist with the expected definitions.
  for r in
    select *
    from (values
      ('customers','ck_customers_phone_normalized',
       'CHECK (((phone_normalized IS NULL) OR (phone_normalized ~ ''^9665[0-9]{8}$''::text)))'),
      ('customers','ck_customers_record_version',
       'CHECK (((record_version IS NULL) OR (record_version >= 1)))'),
      ('inventory_stock','ck_inventory_stock_record_version',
       'CHECK (((record_version IS NULL) OR (record_version >= 1)))')
    ) expected(table_name,constraint_name,constraint_definition)
  loop
    if not exists (
      select 1
      from pg_constraint c
      where c.conrelid = format('public.%I',r.table_name)::regclass
        and c.conname = r.constraint_name
        and c.contype = 'c'
        and regexp_replace(
          lower(pg_get_constraintdef(c.oid,true)),
          '[[:space:]()]','','g'
        ) = regexp_replace(
          lower(r.constraint_definition),
          '[[:space:]()]','','g'
        )
    ) then
      raise exception
        'PACKAGE_2_SCHEMA_DRIFT: check constraint %.% missing or different',
        r.table_name,r.constraint_name;
    end if;
  end loop;

  with normalized as (
    select
      c.id,
      c.tenant_id,
      c.phone,
      c.phone_normalized,
      case
        when x.compact_phone ~ '^05[0-9]{8}$'
          then '966' || substring(x.compact_phone from 2)
        when x.compact_phone ~ '^5[0-9]{8}$'
          then '966' || x.compact_phone
        when x.compact_phone ~ '^\+9665[0-9]{8}$'
          then substring(x.compact_phone from 2)
        when x.compact_phone ~ '^9665[0-9]{8}$'
          then x.compact_phone
        else null
      end as derived_phone_normalized
    from public.customers c
    cross join lateral (
      select regexp_replace(
        translate(
          coalesce(c.phone, ''),
          '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
          '01234567890123456789'
        ),
        '[\s\-\(\)]',
        '',
        'g'
      ) as compact_phone
    ) x
  ),
  metrics as (
    select
      count(*) filter (
        where nullif(btrim(coalesce(phone,'')),'') is not null
          and derived_phone_normalized is null
      ) as invalid,
      count(*) filter (where tenant_id is null) as missing_tenant,
      count(*) filter (
        where phone_normalized is not null
          and phone_normalized is distinct from derived_phone_normalized
      ) as conflicts
    from normalized
  ),
  derived_duplicate_groups as (
    select tenant_id,derived_phone_normalized
    from normalized
    where tenant_id is not null
      and derived_phone_normalized is not null
    group by tenant_id,derived_phone_normalized
    having count(*) > 1
  ),
  existing_duplicate_groups as (
    select tenant_id,phone_normalized
    from normalized
    where tenant_id is not null
      and phone_normalized is not null
    group by tenant_id,phone_normalized
    having count(*) > 1
  )
  select
    metrics.invalid,
    metrics.missing_tenant,
    metrics.conflicts,
    (select count(*) from derived_duplicate_groups),
    (select count(*) from existing_duplicate_groups)
  into
    v_invalid,
    v_missing_tenant,
    v_conflicts,
    v_derived_duplicates,
    v_existing_duplicates
  from metrics;

  select count(*) into v_bad_customer_versions
  from public.customers
  where record_version < 1;

  select count(*) into v_bad_inventory_versions
  from public.inventory_stock
  where record_version < 1;

  select
    (select count(*) from public.orders
      where atomic_engine_version = 'atomic-order-v2-r1')
    + (select count(*) from public.invoices
      where atomic_engine_version = 'atomic-order-v2-r1'
         or financial_engine_version = 'financial-engine-v2-r1')
    + (select count(*) from public.inventory_movements
      where inventory_engine_version = 'inventory-engine-v2-r1')
  into v_unexpected_markers;

  select count(*) into v_index_count
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'uq_customers_tenant_phone_normalized';

  if v_index_count > 1 then
    raise exception 'INDEX_DRIFT: duplicate canonical index names detected';
  elsif v_index_count = 1 then
    select
      i.indrelid = 'public.customers'::regclass
      and i.indisunique
      and i.indisvalid
      and i.indisready
      and array(
        select a.attname
        from unnest(i.indkey::smallint[]) with ordinality k(attnum,ord)
        join pg_attribute a
          on a.attrelid = i.indrelid and a.attnum = k.attnum
        where k.attnum > 0
        order by k.ord
      ) = array['tenant_id','phone_normalized']
      and regexp_replace(
        replace(lower(pg_get_expr(i.indpred,i.indrelid)),'::text',''),
        '[[:space:]()]','','g'
      ) = 'phone_normalizedisnotnull'
    into v_index_ok
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_index i on i.indexrelid = c.oid
    where n.nspname = 'public'
      and c.relname = 'uq_customers_tenant_phone_normalized';

    if not coalesce(v_index_ok,false) then
      raise exception
        'INDEX_DRIFT: uq_customers_tenant_phone_normalized is invalid, unfinished or different; do not drop automatically';
    end if;
  end if;

  if v_missing_tenant > 0
     or v_invalid > 0
     or v_conflicts > 0
     or v_derived_duplicates > 0
     or v_existing_duplicates > 0
     or v_bad_customer_versions > 0
     or v_bad_inventory_versions > 0
     or v_unexpected_markers > 0 then
    raise exception using
      message = format(
        'PACKAGE_3R_BLOCKED missing_tenant=%s invalid_phone=%s normalized_conflict=%s derived_duplicate_groups=%s existing_duplicate_groups=%s invalid_customer_versions=%s invalid_inventory_versions=%s unexpected_core_v2_markers=%s',
        v_missing_tenant,
        v_invalid,
        v_conflicts,
        v_derived_duplicates,
        v_existing_duplicates,
        v_bad_customer_versions,
        v_bad_inventory_versions,
        v_unexpected_markers
      );
  end if;
end;
$package3r_pre_mutation_gate$;

/* ========================================================================== */
/* SECTION B — ONE BOUNDED CUSTOMER PHONE-NORMALIZATION BATCH                  */
/* Re-run this entire transaction until updated_count = 0.                     */
/* ========================================================================== */

begin;
with candidate_rows as (
  select
    c.id,
    case
      when x.compact_phone ~ '^05[0-9]{8}$'
        then '966' || substring(x.compact_phone from 2)
      when x.compact_phone ~ '^5[0-9]{8}$'
        then '966' || x.compact_phone
      when x.compact_phone ~ '^\+9665[0-9]{8}$'
        then substring(x.compact_phone from 2)
      when x.compact_phone ~ '^9665[0-9]{8}$'
        then x.compact_phone
      else null
    end as derived_phone_normalized
  from public.customers c
  cross join lateral (
    select regexp_replace(
      translate(
        coalesce(c.phone, ''),
        '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
        '01234567890123456789'
      ),
      '[\s\-\(\)]',
      '',
      'g'
    ) as compact_phone
  ) x
  where c.phone_normalized is null
    and (
      x.compact_phone ~ '^05[0-9]{8}$'
      or x.compact_phone ~ '^5[0-9]{8}$'
      or x.compact_phone ~ '^\+9665[0-9]{8}$'
      or x.compact_phone ~ '^9665[0-9]{8}$'
    )
  order by c.id
  limit 1000
  for update of c skip locked
),
eligible_rows as (
  select id,derived_phone_normalized
  from candidate_rows
  where derived_phone_normalized is not null
),
updated_rows as (
  update public.customers c
  set phone_normalized = e.derived_phone_normalized
  from eligible_rows e
  where c.id = e.id
    and c.phone_normalized is null
  returning c.id
)
select count(*) as updated_count
from updated_rows;
commit;

/* ========================================================================== */
/* SECTION C — ONE BOUNDED CUSTOMER RECORD-VERSION BATCH                      */
/* Re-run this entire transaction until updated_count = 0.                     */
/* ========================================================================== */

begin;
with candidate_rows as (
  select c.id
  from public.customers c
  where c.record_version is null
  order by c.id
  limit 1000
  for update of c skip locked
),
updated_rows as (
  update public.customers c
  set record_version = 1
  from candidate_rows candidate
  where c.id = candidate.id
    and c.record_version is null
  returning c.id
)
select count(*) as updated_count
from updated_rows;
commit;

/* ========================================================================== */
/* SECTION D — ONE BOUNDED INVENTORY RECORD-VERSION BATCH                     */
/* Re-run this entire transaction until updated_count = 0.                     */
/* ========================================================================== */

begin;
with candidate_rows as (
  select s.id
  from public.inventory_stock s
  where s.record_version is null
  order by s.id
  limit 1000
  for update of s skip locked
),
updated_rows as (
  update public.inventory_stock s
  set record_version = 1
  from candidate_rows candidate
  where s.id = candidate.id
    and s.record_version is null
  returning s.id
)
select count(*) as updated_count
from updated_rows;
commit;

/* ========================================================================== */
/* SECTION E — READ-ONLY POST-BATCH PROGRESS VERIFICATION                     */
/* ========================================================================== */

with normalized as (
  select
    c.id,
    c.tenant_id,
    c.phone,
    c.phone_normalized,
    case
      when x.compact_phone ~ '^05[0-9]{8}$'
        then '966' || substring(x.compact_phone from 2)
      when x.compact_phone ~ '^5[0-9]{8}$'
        then '966' || x.compact_phone
      when x.compact_phone ~ '^\+9665[0-9]{8}$'
        then substring(x.compact_phone from 2)
      when x.compact_phone ~ '^9665[0-9]{8}$'
        then x.compact_phone
      else null
    end as derived_phone_normalized
  from public.customers c
  cross join lateral (
    select regexp_replace(
      translate(
        coalesce(c.phone, ''),
        '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
        '01234567890123456789'
      ),
      '[\s\-\(\)]',
      '',
      'g'
    ) as compact_phone
  ) x
),
derived_duplicate_groups as (
  select tenant_id,derived_phone_normalized
  from normalized
  where tenant_id is not null
    and derived_phone_normalized is not null
  group by tenant_id,derived_phone_normalized
  having count(*) > 1
),
unexpected_markers as (
  select id from public.orders
  where atomic_engine_version = 'atomic-order-v2-r1'
  union all
  select id from public.invoices
  where atomic_engine_version = 'atomic-order-v2-r1'
     or financial_engine_version = 'financial-engine-v2-r1'
  union all
  select id from public.inventory_movements
  where inventory_engine_version = 'inventory-engine-v2-r1'
)
select
  count(*) filter (
    where derived_phone_normalized is not null
      and phone_normalized is null
  ) as customers_requiring_phone_normalization,
  (select count(*) from public.customers
    where record_version is null) as customers_requiring_record_version,
  (select count(*) from public.inventory_stock
    where record_version is null) as inventory_requiring_record_version,
  count(*) filter (
    where nullif(btrim(coalesce(phone,'')),'') is not null
      and derived_phone_normalized is null
  ) as invalid_nonempty_phone_count,
  count(*) filter (where tenant_id is null) as missing_customer_tenant_count,
  count(*) filter (
    where phone_normalized is not null
      and phone_normalized is distinct from derived_phone_normalized
  ) as normalization_conflict_count,
  (select count(*) from derived_duplicate_groups)
    as duplicate_canonical_identity_group_count,
  (select count(*) from public.customers
    where record_version < 1)
    + (select count(*) from public.inventory_stock
      where record_version < 1) as invalid_record_version_count,
  (select count(*) from unexpected_markers)
    as unexpected_core_v2_marker_count
from normalized;

/* ========================================================================== */
/* SECTION F — UNIQUE-INDEX READINESS VERIFICATION                            */
/* Read the NOTICE. Execute Section G only when it reports CREATE_REQUIRED.    */
/* ========================================================================== */

do $customer_identity_index_readiness$
declare
  v_blockers bigint;
  v_index_count bigint;
  v_index_ok boolean;
begin
  with normalized as (
    select
      c.id,
      c.tenant_id,
      c.phone,
      c.phone_normalized,
      case
        when x.compact_phone ~ '^05[0-9]{8}$'
          then '966' || substring(x.compact_phone from 2)
        when x.compact_phone ~ '^5[0-9]{8}$'
          then '966' || x.compact_phone
        when x.compact_phone ~ '^\+9665[0-9]{8}$'
          then substring(x.compact_phone from 2)
        when x.compact_phone ~ '^9665[0-9]{8}$'
          then x.compact_phone
        else null
      end as derived_phone_normalized
    from public.customers c
    cross join lateral (
      select regexp_replace(
        translate(
          coalesce(c.phone, ''),
          '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
          '01234567890123456789'
        ),
        '[\s\-\(\)]',
        '',
        'g'
      ) as compact_phone
    ) x
  ),
  duplicate_groups as (
    select tenant_id,derived_phone_normalized
    from normalized
    where tenant_id is not null
      and derived_phone_normalized is not null
    group by tenant_id,derived_phone_normalized
    having count(*) > 1
  )
  select
    count(*) filter (
      where phone_normalized is not null and tenant_id is null
    )
    + count(*) filter (
      where nullif(btrim(coalesce(phone,'')),'') is not null
        and derived_phone_normalized is null
    )
    + count(*) filter (
      where phone_normalized is not null
        and phone_normalized is distinct from derived_phone_normalized
    )
    + count(*) filter (
      where derived_phone_normalized is not null
        and phone_normalized is null
    )
    + (select count(*) from duplicate_groups)
  into v_blockers
  from normalized;

  if v_blockers > 0 then
    raise exception
      'CUSTOMER_IDENTITY_INDEX_BLOCKED: % readiness blockers remain',
      v_blockers;
  end if;

  select count(*) into v_index_count
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = 'uq_customers_tenant_phone_normalized';

  if v_index_count = 0 then
    raise notice 'CREATE_REQUIRED: execute standalone Section G';
    return;
  elsif v_index_count > 1 then
    raise exception 'INDEX_DRIFT: duplicate canonical index names detected';
  end if;

  select
    i.indrelid = 'public.customers'::regclass
    and i.indisunique
    and i.indisvalid
    and i.indisready
    and array(
      select a.attname
      from unnest(i.indkey::smallint[]) with ordinality k(attnum,ord)
      join pg_attribute a
        on a.attrelid = i.indrelid and a.attnum = k.attnum
      where k.attnum > 0
      order by k.ord
    ) = array['tenant_id','phone_normalized']
    and regexp_replace(
      replace(lower(pg_get_expr(i.indpred,i.indrelid)),'::text',''),
      '[[:space:]()]','','g'
    ) = 'phone_normalizedisnotnull'
  into v_index_ok
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_index i on i.indexrelid = c.oid
  where n.nspname = 'public'
    and c.relname = 'uq_customers_tenant_phone_normalized';

  if not coalesce(v_index_ok,false) then
    raise exception
      'INDEX_DRIFT: canonical index is invalid, unfinished or different; inspect evidence and obtain approval before manual DROP INDEX CONCURRENTLY';
  end if;

  raise notice 'SKIP_SECTION_G: exact valid canonical index already exists';
end;
$customer_identity_index_readiness$;

/* ========================================================================== */
/* SECTION G — STANDALONE CONCURRENT UNIQUE-INDEX CREATION                    */
/* Do not wrap in BEGIN/COMMIT. Skip only when Section F says SKIP_SECTION_G.  */
/* On failure, run A9/H. Never drop an invalid artifact automatically. Obtain  */
/* approval before a manual DROP INDEX CONCURRENTLY and retry.                 */
/* ========================================================================== */

create unique index concurrently uq_customers_tenant_phone_normalized
  on public.customers (tenant_id, phone_normalized)
  where phone_normalized is not null;

/* ========================================================================== */
/* SECTION H — EXACT READ-ONLY POST-INDEX VERIFICATION                        */
/* ========================================================================== */

do $verify_customer_identity_index$
declare
  v_ok boolean;
begin
  select
    i.indrelid = 'public.customers'::regclass
    and i.indisunique
    and i.indisvalid
    and i.indisready
    and array(
      select a.attname
      from unnest(i.indkey::smallint[]) with ordinality k(attnum,ord)
      join pg_attribute a
        on a.attrelid = i.indrelid and a.attnum = k.attnum
      where k.attnum > 0
      order by k.ord
    ) = array['tenant_id','phone_normalized']
    and regexp_replace(
      replace(lower(pg_get_expr(i.indpred,i.indrelid)),'::text',''),
      '[[:space:]()]','','g'
    ) = 'phone_normalizedisnotnull'
  into v_ok
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_index i on i.indexrelid = c.oid
  where n.nspname = 'public'
    and c.relname = 'uq_customers_tenant_phone_normalized';

  if not found or not coalesce(v_ok,false) then
    raise exception
      'INDEX_VERIFICATION_FAILED: uq_customers_tenant_phone_normalized is missing, invalid, unfinished or different';
  end if;
end;
$verify_customer_identity_index$;

/* ========================================================================== */
/* SECTION I — OPTIONAL, SEPARATE CANONICAL CONSTRAINT VALIDATIONS            */
/* Each validation scans its table. Run each I subsection separately during   */
/* an approved low-traffic window; cancellation leaves the constraint NOT     */
/* VALID and does not remove it. No Core V2 completeness or FK is validated.   */
/* ========================================================================== */

-- I1. customers.phone_normalized. Expected: table scan; brief lock acquisition.
do $gate_ck_customers_phone_normalized$
begin
  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.customers'::regclass
      and c.conname = 'ck_customers_phone_normalized'
      and c.contype = 'c'
      and regexp_replace(
        lower(pg_get_constraintdef(c.oid,true)),
        '[[:space:]()]','','g'
      ) = regexp_replace(
        lower('CHECK (((phone_normalized IS NULL) OR (phone_normalized ~ ''^9665[0-9]{8}$''::text)))'),
        '[[:space:]()]','','g'
      )
  ) then
    raise exception
      'CONSTRAINT_DRIFT: ck_customers_phone_normalized missing or different';
  end if;

  if exists (
    select 1
    from public.customers
    where phone_normalized is not null
      and phone_normalized !~ '^9665[0-9]{8}$'
  ) then
    raise exception
      'CONSTRAINT_VALIDATION_BLOCKED: invalid phone_normalized values remain';
  end if;
end;
$gate_ck_customers_phone_normalized$;

alter table public.customers
  validate constraint ck_customers_phone_normalized;

-- I2. customers.record_version. Expected: table scan; brief lock acquisition.
do $gate_ck_customers_record_version$
begin
  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.customers'::regclass
      and c.conname = 'ck_customers_record_version'
      and c.contype = 'c'
      and regexp_replace(
        lower(pg_get_constraintdef(c.oid,true)),
        '[[:space:]()]','','g'
      ) = regexp_replace(
        lower('CHECK (((record_version IS NULL) OR (record_version >= 1)))'),
        '[[:space:]()]','','g'
      )
  ) then
    raise exception
      'CONSTRAINT_DRIFT: ck_customers_record_version missing or different';
  end if;

  if exists (
    select 1
    from public.customers
    where record_version is null or record_version < 1
  ) then
    raise exception
      'CONSTRAINT_VALIDATION_BLOCKED: invalid customer record versions remain';
  end if;
end;
$gate_ck_customers_record_version$;

alter table public.customers
  validate constraint ck_customers_record_version;

-- I3. inventory_stock.record_version. Expected: table scan; brief lock.
do $gate_ck_inventory_stock_record_version$
begin
  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.inventory_stock'::regclass
      and c.conname = 'ck_inventory_stock_record_version'
      and c.contype = 'c'
      and regexp_replace(
        lower(pg_get_constraintdef(c.oid,true)),
        '[[:space:]()]','','g'
      ) = regexp_replace(
        lower('CHECK (((record_version IS NULL) OR (record_version >= 1)))'),
        '[[:space:]()]','','g'
      )
  ) then
    raise exception
      'CONSTRAINT_DRIFT: ck_inventory_stock_record_version missing or different';
  end if;

  if exists (
    select 1
    from public.inventory_stock
    where record_version is null or record_version < 1
  ) then
    raise exception
      'CONSTRAINT_VALIDATION_BLOCKED: invalid inventory record versions remain';
  end if;
end;
$gate_ck_inventory_stock_record_version$;

alter table public.inventory_stock
  validate constraint ck_inventory_stock_record_version;

/*
END OF PACKAGE 3R

No NOT NULL enforcement is included.
No Package 2B lookup index is recreated.
No historical order, invoice or invoice-item snapshot is mutated.
No customer is merged, deleted, selected as a winner or reassigned.
No invalid concurrent-index artifact is dropped automatically.
*/
