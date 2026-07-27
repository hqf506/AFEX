/*
AFEX Core V2 — Package 1R-S
Supabase-compatible unified Production preflight report.

SOURCE ATTESTATION
01-read-only-preflight.sql
SHA-256: 8ad84ff0f9b7193bc4ef0cd1ae9003398a62d94b1c7a025c2f3829320dff4c5a

SAFETY CONTRACT
- One top-level read-only query and one result set.
- Catalog reads and aggregate business-table counts only.
- No business-row values, credentials, PII, DDL, DML, procedural blocks,
  temporary objects, transaction control, role changes, grants, or settings.
- No user-defined function is invoked.
- REVIEW_REQUIRED or BLOCKED are the only final decisions.

ORIGINAL PACKAGE 1R COVERAGE MATRIX
Original section | Unified sections | Transformation | Omission
P1.1 Safe server and schema identity | 001-011 | NORMALIZED / EMPTY-ROW-WRAPPED | NONE
P1.2 Baseline columns and future-column presence | 012-016,049 | NORMALIZED / EMPTY-ROW-WRAPPED | NONE
P1.3 Constraints, indexes, triggers, RLS and grants | 017-048 | NORMALIZED / EMPTY-ROW-WRAPPED | NONE
P1.4 Customer normalization diagnostics | 058-059,065 | SUMMARY / EMPTY-ROW-WRAPPED | NONE
P1.5 Tenant, branch, parent and catalog scope diagnostics | 058,065 | SUMMARY / EMPTY-ROW-WRAPPED | NONE
P1.6 Numbering hardening | 058,065 | SUMMARY / EMPTY-ROW-WRAPPED | NONE
P1.7 Inventory and movement consistency | 058,065 | SUMMARY / EMPTY-ROW-WRAPPED | NONE
P1.8 Snapshot readiness classification | 058-059,065 | SUMMARY / EMPTY-ROW-WRAPPED | NONE
P1.9 Existing Core V2 collision check | 050-055,064-065 | DIRECT / EMPTY-ROW-WRAPPED | NONE
P1.10 Migration risk scan | 021-026,058-061,065 | NORMALIZED / SUMMARY / EMPTY-ROW-WRAPPED | NONE
*/
with
section_catalog(section_order,section_name) as (
  values
    (1,'REPORT_METADATA'),
    (2,'SERVER_VERSION'),
    (3,'DATABASE_IDENTITY'),
    (4,'SESSION_USER_AND_CURRENT_USER'),
    (5,'CURRENT_SCHEMA'),
    (6,'READ_ONLY_SESSION_STATE'),
    (7,'SERVER_ADDRESS_AND_PORT'),
    (8,'EXTENSIONS_AND_VERSIONS'),
    (9,'SCHEMAS'),
    (10,'ROLES_AND_ATTRIBUTES'),
    (11,'ROLE_MEMBERSHIPS'),
    (12,'TABLES'),
    (13,'COLUMNS_AND_TYPES'),
    (14,'COLUMN_NULLABILITY'),
    (15,'COLUMN_DEFAULTS'),
    (16,'GENERATED_AND_IDENTITY_COLUMNS'),
    (17,'PRIMARY_KEYS'),
    (18,'UNIQUE_CONSTRAINTS'),
    (19,'FOREIGN_KEYS'),
    (20,'CHECK_CONSTRAINTS'),
    (21,'INDEX_DEFINITIONS'),
    (22,'INDEX_UNIQUENESS'),
    (23,'INDEX_PREDICATES'),
    (24,'INDEX_VALIDITY'),
    (25,'INDEX_READINESS'),
    (26,'INDEX_ACCESS_METHODS'),
    (27,'FUNCTIONS_AND_SIGNATURES'),
    (28,'FUNCTION_OWNERS'),
    (29,'FUNCTION_LANGUAGES'),
    (30,'FUNCTION_VOLATILITY'),
    (31,'FUNCTION_PARALLEL_SAFETY'),
    (32,'FUNCTION_SECURITY_MODE'),
    (33,'FUNCTION_SEARCH_PATH_CONFIG'),
    (34,'FUNCTION_ACLS'),
    (35,'UNEXPECTED_OVERLOADS'),
    (36,'TABLES_WITH_RLS_ENABLED'),
    (37,'TABLES_WITH_FORCE_RLS'),
    (38,'RLS_POLICIES'),
    (39,'POLICY_COMMAND_AND_ROLES'),
    (40,'POLICY_USING_CLAUSES'),
    (41,'POLICY_WITH_CHECK_CLAUSES'),
    (42,'TRIGGERS'),
    (43,'TRIGGER_DEFINITIONS'),
    (44,'TRIGGER_FUNCTION_LINKAGE'),
    (45,'TABLE_ACLS'),
    (46,'SEQUENCE_ACLS'),
    (47,'SCHEMA_ACLS'),
    (48,'DEFAULT_PRIVILEGES'),
    (49,'OBJECT_OWNERS'),
    (50,'EXISTING_CORE_V2_TABLES'),
    (51,'EXISTING_CORE_V2_FUNCTIONS'),
    (52,'EXISTING_CORE_V2_ROLES'),
    (53,'EXISTING_CORE_V2_TRIGGERS'),
    (54,'EXISTING_CORE_V2_POLICIES'),
    (55,'ACTIVATION_CONFIGURATION_OBJECTS'),
    (56,'LEGACY_MUTATION_PATHS'),
    (57,'STORAGE_CONFIGURATION_METADATA'),
    (58,'DATA_READINESS_COUNTS'),
    (59,'BACKFILL_CANDIDATE_COUNTS'),
    (60,'INVALID_NOT_READY_INDEX_SUMMARY'),
    (61,'UNSAFE_ROLE_ATTRIBUTE_SUMMARY'),
    (62,'PUBLIC_EXPOSURE_SUMMARY'),
    (63,'SERVICE_ROLE_EXPOSURE_SUMMARY'),
    (64,'DUPLICATE_OVERLOAD_SUMMARY'),
    (65,'FINAL_BLOCKING_SUMMARY')
),
baseline_relations(object_name) as (
  values
    ('tenants'),('branches'),('profiles'),('pos_profiles'),('customers'),
    ('orders'),('invoices'),('invoice_items'),('catalog_items'),
    ('branch_catalog_items'),('inventory_stock'),('inventory_movements'),
    ('order_number_sequences'),('audit_logs'),('discounts'),('vat_settings')
),
future_relations(object_name) as (
  values
    ('financial_quotes'),('idempotency_commands'),('atomic_outbox'),
    ('atomic_authorization_contexts'),('core_v2_activation_control'),
    ('core_v2_tenant_activation'),('core_v2_branch_activation'),
    ('core_v2_verification_evidence'),('core_v2_managed_identities'),
    ('core_v2_issuer_rate_limit_config'),('core_v2_issuer_rate_limit_windows')
),
future_function_names(object_name) as (
  values
    ('normalize_customer_phone_v2'),('resolve_customer_identity_v2'),
    ('resolve_customer_identity_result_v2'),('acquire_idempotency_command_v2'),
    ('allocate_branch_monthly_number_v2'),('resolve_inventory_requirements_v2'),
    ('lock_and_validate_inventory_v2'),('apply_inventory_mutations_v2'),
    ('enqueue_atomic_outbox_v2'),('create_order_atomic_v2'),
    ('issue_atomic_authorization_context_v1'),
    ('issue_pos_atomic_authorization_context_v1'),
    ('consume_atomic_authorization_context_v1'),
    ('issue_authoritative_financial_quote_v1'),
    ('verify_core_v2_activation_readiness_v2')
),
index_meta as (
  select
    nt.nspname object_schema,
    t.relname table_name,
    i.relname index_name,
    ix.indisunique,
    ix.indisvalid,
    ix.indisready,
    am.amname access_method,
    pg_catalog.pg_get_indexdef(i.oid) definition,
    pg_catalog.pg_get_expr(ix.indpred,ix.indrelid) predicate
  from pg_catalog.pg_index ix
  join pg_catalog.pg_class i on i.oid=ix.indexrelid
  join pg_catalog.pg_class t on t.oid=ix.indrelid
  join pg_catalog.pg_namespace nt on nt.oid=t.relnamespace
  join pg_catalog.pg_am am on am.oid=i.relam
  where nt.nspname not in ('pg_catalog','information_schema')
),
function_meta as (
  select
    n.nspname object_schema,
    p.proname object_name,
    p.oid,
    p.oid::regprocedure::text signature,
    r.rolname owner_name,
    l.lanname language_name,
    p.provolatile,
    p.proparallel,
    p.prosecdef,
    p.proconfig,
    p.proacl,
    regexp_replace(
      pg_catalog.pg_get_functiondef(p.oid),
      '(?i)(password|secret|token|api[_-]?key)[[:space:]]*[:=][[:space:]]*[^,;[:space:]]+',
      '\1=[REDACTED]',
      'g'
    ) safe_definition
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid=p.pronamespace
  join pg_catalog.pg_roles r on r.oid=p.proowner
  join pg_catalog.pg_language l on l.oid=p.prolang
  where n.nspname not in ('pg_catalog','information_schema')
),
trigger_meta as (
  select
    n.nspname object_schema,
    c.relname table_name,
    t.tgname trigger_name,
    p.oid::regprocedure::text trigger_function,
    pg_catalog.pg_get_triggerdef(t.oid,true) definition
  from pg_catalog.pg_trigger t
  join pg_catalog.pg_class c on c.oid=t.tgrelid
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  join pg_catalog.pg_proc p on p.oid=t.tgfoid
  where not t.tgisinternal
    and n.nspname not in ('pg_catalog','information_schema')
),
policy_meta as (
  select
    schemaname object_schema,
    tablename table_name,
    policyname policy_name,
    permissive,
    roles,
    cmd,
    qual,
    with_check
  from pg_catalog.pg_policies
),
acl_meta as (
  select
    n.nspname object_schema,
    c.relname object_name,
    c.relkind,
    coalesce(c.relacl,pg_catalog.acldefault(
      case when c.relkind='S' then 'S'::"char" else 'r'::"char" end,
      c.relowner
    )) acl
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where c.relkind in ('r','p','v','m','S')
    and n.nspname not in ('pg_catalog','information_schema')
),
acl_expanded as (
  select
    a.object_schema,
    a.object_name,
    a.relkind,
    coalesce(grantee.rolname,'PUBLIC') grantee_name,
    x.privilege_type,
    x.is_grantable
  from acl_meta a
  cross join lateral pg_catalog.aclexplode(a.acl) x
  left join pg_catalog.pg_roles grantee on grantee.oid=x.grantee
),
function_acl_expanded as (
  select
    f.object_schema,
    f.signature object_name,
    coalesce(grantee.rolname,'PUBLIC') grantee_name,
    x.privilege_type,
    x.is_grantable
  from function_meta f
  cross join lateral pg_catalog.aclexplode(
    coalesce(f.proacl,pg_catalog.acldefault('f'::"char",(
      select p.proowner from pg_catalog.pg_proc p where p.oid=f.oid
    )))
  ) x
  left join pg_catalog.pg_roles grantee on grantee.oid=x.grantee
),
core_relation_collisions as (
  select f.object_name
  from future_relations f
  where to_regclass(format('public.%I',f.object_name)) is not null
),
core_function_collisions as (
  select distinct f.signature
  from function_meta f
  join future_function_names x on x.object_name=f.object_name
  where f.object_schema='public'
),
core_role_collisions as (
  select r.rolname
  from pg_catalog.pg_roles r
  where r.rolname in (
    'afex_core_owner','afex_context_issuer','afex_outbox_worker',
    'afex_core_runtime','afex_core_activation_owner',
    'afex_core_activation_operator'
  )
),
core_trigger_collisions as (
  select trigger_name
  from trigger_meta
  where trigger_name like '%core_v2%'
     or trigger_name like '%atomic%'
     or trigger_name like '%financial_quote%'
),
core_policy_collisions as (
  select policy_name
  from policy_meta
  where policy_name like '%core_v2%'
     or policy_name like '%atomic%'
     or policy_name like '%financial_quote%'
),
unsafe_roles as (
  select rolname
  from pg_catalog.pg_roles
  where (rolsuper or rolbypassrls or rolreplication)
    and rolname not in ('postgres','supabase_admin','service_role')
),
overload_groups as (
  select object_schema,object_name,count(*) overload_count
  from function_meta
  group by object_schema,object_name
  having count(*)>1
),
readiness_counts as (
  select 'customers_total' metric,count(*)::bigint value from public.customers
  union all
  select 'customers_missing_tenant',count(*) from public.customers where tenant_id is null
  union all
  select 'customers_phone_normalized_candidates',count(*) from public.customers c
    where nullif(to_jsonb(c)->>'phone_normalized','') is null
      and nullif(btrim(c.phone),'') is not null
  union all
  select 'customers_record_version_candidates',count(*) from public.customers c
    where nullif(to_jsonb(c)->>'record_version','') is null
  union all
  select 'orders_missing_tenant',count(*) from public.orders where tenant_id is null
  union all
  select 'invoices_missing_tenant',count(*) from public.invoices where tenant_id is null
  union all
  select 'invoice_items_missing_tenant',count(*) from public.invoice_items where tenant_id is null
  union all
  select 'orders_without_customer',count(*) from public.orders o
    where o.customer_id is not null and not exists (
      select 1 from public.customers c where c.id=o.customer_id
    )
  union all
  select 'invoices_without_order',count(*) from public.invoices i
    where i.order_id is not null and not exists (
      select 1 from public.orders o where o.id=i.order_id
    )
  union all
  select 'invoice_items_without_invoice',count(*) from public.invoice_items ii
    where not exists (select 1 from public.invoices i where i.id=ii.invoice_id)
  union all
  select 'negative_quantity_on_hand_count',count(*) from public.inventory_stock
    where quantity_on_hand<0
  union all
  select 'inventory_quantity_on_hand_null_count',count(*) from public.inventory_stock
    where quantity_on_hand is null
  union all
  select 'low_stock_count',count(*) from public.inventory_stock
    where low_stock_threshold>0
      and quantity_on_hand<=low_stock_threshold
  union all
  select 'inventory_record_version_candidates',count(*) from public.inventory_stock s
    where nullif(to_jsonb(s)->>'record_version','') is null
  union all
  select 'inventory_movements_without_stock_identity',count(*)
    from public.inventory_movements m
    where not exists (
      select 1 from public.inventory_stock s
      where s.tenant_id=m.tenant_id
        and s.branch_id=m.branch_id
        and s.catalog_item_id=m.catalog_item_id
    )
  union all
  select 'customer_normalized_identity_duplicate_groups',count(*)
  from (
    select tenant_id,normalized_phone
    from (
      select c.tenant_id,
        case
          when regexp_replace(c.phone,'[^0-9]','','g') ~ '^05[0-9]{8}$'
            then '966'||substring(regexp_replace(c.phone,'[^0-9]','','g') from 2)
          when regexp_replace(c.phone,'[^0-9]','','g') ~ '^5[0-9]{8}$'
            then '966'||regexp_replace(c.phone,'[^0-9]','','g')
          when regexp_replace(c.phone,'[^0-9]','','g') ~ '^9665[0-9]{8}$'
            then regexp_replace(c.phone,'[^0-9]','','g')
          else null
        end normalized_phone
      from public.customers c
    ) n
    where normalized_phone is not null
    group by tenant_id,normalized_phone
    having count(*)>1
  ) d
  union all
  select 'branch_prefix_missing_or_invalid',count(*) from public.branches b
    where b.deleted_at is null
      and (b.order_number_prefix is null or b.order_number_prefix !~ '^[0-9]{2}$')
  union all
  select 'branch_prefix_duplicate_groups',count(*) from (
    select b.tenant_id,b.order_number_prefix
    from public.branches b
    where b.order_number_prefix is not null
    group by b.tenant_id,b.order_number_prefix
    having count(*)>1
  ) d
  union all
  select 'order_number_duplicate_groups',count(*) from (
    select tenant_id,branch_id,order_sequence_month,order_number
    from public.orders
    group by tenant_id,branch_id,order_sequence_month,order_number
    having count(*)>1
  ) d
  union all
  select 'invoice_number_duplicate_groups',count(*) from (
    select tenant_id,branch_id,invoice_sequence_month,invoice_number
    from public.invoices
    group by tenant_id,branch_id,invoice_sequence_month,invoice_number
    having count(*)>1
  ) d
  union all
  select 'invoice_order_number_mismatches',count(*)
    from public.invoices i join public.orders o on o.id=i.order_id
    where i.invoice_number is distinct from o.order_number
  union all
  select 'order_sequence_month_mismatches',count(*) from public.orders o
    where o.order_sequence_month is distinct from
      date_trunc('month',o.created_at at time zone 'UTC')::date
  union all
  select 'sequence_scope_or_month_errors',count(*)
    from public.order_number_sequences s
    left join public.tenants t on t.id=s.tenant_id
    left join public.branches b on b.id=s.branch_id
    where t.id is null or b.id is null
      or s.tenant_id is distinct from b.tenant_id
      or s.sequence_month is null
      or s.sequence_month is distinct from date_trunc('month',s.sequence_month)::date
  union all
  select 'inventory_duplicate_identity_groups',count(*) from (
    select tenant_id,branch_id,catalog_item_id
    from public.inventory_stock
    group by tenant_id,branch_id,catalog_item_id
    having count(*)>1
  ) d
  union all
  select 'orders_missing_core_snapshot_evidence',count(*) from public.orders o
    where nullif(to_jsonb(o)->>'customer_name_snapshot','') is null
       or nullif(to_jsonb(o)->>'atomic_engine_version','') is null
  union all
  select 'invoices_missing_core_snapshot_evidence',count(*) from public.invoices i
    where nullif(to_jsonb(i)->>'financial_engine_version','') is null
       or nullif(to_jsonb(i)->>'request_fingerprint','') is null
  union all
  select 'invoice_items_missing_core_snapshot_evidence',count(*) from public.invoice_items i
    where nullif(to_jsonb(i)->>'unit_price_snapshot','') is null
       or nullif(to_jsonb(i)->>'line_total_snapshot','') is null
),
blocking_metrics as (
  select 'invalid_index_count' metric,count(*)::bigint value,'CRITICAL' severity
    from index_meta where not indisvalid
  union all
  select 'not_ready_index_count',count(*),'CRITICAL' from index_meta where not indisready
  union all
  select 'unexpected_core_v2_object_count',
    (select count(*) from core_relation_collisions)
    +(select count(*) from core_function_collisions)
    +(select count(*) from core_role_collisions)
    +(select count(*) from core_trigger_collisions)
    +(select count(*) from core_policy_collisions),'HIGH'
  union all
  select 'unsafe_role_attribute_count',count(*),'CRITICAL' from unsafe_roles
  union all
  select 'public_exposure_count',count(*),'CRITICAL'
    from (
      select object_schema,object_name,privilege_type from acl_expanded
      where grantee_name='PUBLIC'
      union all
      select object_schema,object_name,privilege_type from function_acl_expanded
      where grantee_name='PUBLIC'
    ) p
  union all
  select 'service_role_exposure_requiring_review',count(*),'MEDIUM'
    from (
      select object_schema,object_name,privilege_type from acl_expanded
      where grantee_name='service_role'
      union all
      select object_schema,object_name,privilege_type from function_acl_expanded
      where grantee_name='service_role'
    ) s
  union all
  select 'unexpected_overload_count',coalesce(sum(overload_count-1),0)::bigint,'HIGH'
    from overload_groups o
    join future_function_names f on f.object_name=o.object_name
    where o.object_schema='public'
  union all
  select 'unknown_trigger_count',count(*),'HIGH' from core_trigger_collisions
  union all
  select 'unknown_policy_count',count(*),'HIGH' from core_policy_collisions
  union all
  select 'unknown_function_count',count(*),'HIGH' from core_function_collisions
  union all
  select 'missing_baseline_dependency_count',count(*),'CRITICAL'
    from baseline_relations b
    where to_regclass(format('public.%I',b.object_name)) is null
),
report_rows as (
  select 1 section_order,'REPORT_METADATA' section_name,1 item_order,
    null::text object_schema,'Package 1R-S' object_name,'report' object_type,
    'source_sha256' attribute_name,
    '8ad84ff0f9b7193bc4ef0cd1ae9003398a62d94b1c7a025c2f3829320dff4c5a' attribute_value,
    'INFO' status,'INFO' severity,
    'Unified metadata report; external review is required.' notes
  union all
  select 2,'SERVER_VERSION',1,null,'server','server','version',version(),
    'INFO','INFO','Server version reported without modification.'
  union all
  select 3,'DATABASE_IDENTITY',1,null,current_database(),'database','current_database',
    current_database(),'INFO','INFO','Database name only; no connection details.'
  union all
  select 4,'SESSION_USER_AND_CURRENT_USER',row_number() over (),
    null,x.name,'session_identity',x.attribute,x.value,'INFO','INFO',
    'Operational identity metadata.'
  from (values
    ('session_user','session_user',session_user::text),
    ('current_user','current_user',current_user::text)
  ) x(name,attribute,value)
  union all
  select 5,'CURRENT_SCHEMA',1,null,current_schema(),'schema_context',
    'current_schema',current_schema(),'INFO','INFO','Current schema.'
  union all
  select 6,'READ_ONLY_SESSION_STATE',row_number() over (),null,x.name,
    'session_setting',x.name,x.value,
    case when x.name='transaction_read_only' and x.value<>'on' then 'WARNING' else 'INFO' end,
    case when x.name='transaction_read_only' and x.value<>'on' then 'HIGH' else 'INFO' end,
    'Read-only/session state metadata.'
  from (values
    ('transaction_read_only',current_setting('transaction_read_only',true)),
    ('default_transaction_read_only',current_setting('default_transaction_read_only',true)),
    ('search_path',current_setting('search_path',true))
  ) x(name,value)
  union all
  select 7,'SERVER_ADDRESS_AND_PORT',row_number() over (),null,'server',
    'network_metadata',x.name,x.value,'INFO','LOW',
    'Server endpoint metadata only; no credentials.'
  from (values
    ('server_address',coalesce(inet_server_addr()::text,'not_visible')),
    ('server_port',coalesce(inet_server_port()::text,'not_visible'))
  ) x(name,value)
  union all
  select 8,'EXTENSIONS_AND_VERSIONS',row_number() over(order by e.extname),
    n.nspname,e.extname,'extension','version',e.extversion,'PRESENT','INFO',
    'Installed extension metadata.'
  from pg_catalog.pg_extension e join pg_catalog.pg_namespace n on n.oid=e.extnamespace
  union all
  select 9,'SCHEMAS',row_number() over(order by n.nspname),n.nspname,n.nspname,
    'schema','owner',r.rolname,'PRESENT','INFO','Schema inventory.'
  from pg_catalog.pg_namespace n join pg_catalog.pg_roles r on r.oid=n.nspowner
  union all
  select 10,'ROLES_AND_ATTRIBUTES',row_number() over(order by r.rolname),null,
    r.rolname,'role','attributes',
    jsonb_build_object('superuser',r.rolsuper,'inherit',r.rolinherit,
      'create_role',r.rolcreaterole,'create_db',r.rolcreatedb,
      'can_login',r.rolcanlogin,'replication',r.rolreplication,
      'bypass_rls',r.rolbypassrls,'connection_limit',r.rolconnlimit)::text,
    case when u.rolname is not null then 'BLOCKED' else 'INFO' end,
    case when u.rolname is not null then 'CRITICAL' else 'INFO' end,
    'Role attributes only; no password metadata.'
  from pg_catalog.pg_roles r left join unsafe_roles u on u.rolname=r.rolname
  union all
  select 11,'ROLE_MEMBERSHIPS',row_number() over(order by parent.rolname,member.rolname),
    null,member.rolname,'role_membership','member_of',parent.rolname,
    'INFO','INFO','Role membership inventory.'
  from pg_catalog.pg_auth_members m
  join pg_catalog.pg_roles parent on parent.oid=m.roleid
  join pg_catalog.pg_roles member on member.oid=m.member
  union all
  select 12,'TABLES',row_number() over(order by n.nspname,c.relname),
    n.nspname,c.relname,'table','relkind',c.relkind::text,'PRESENT','INFO',
    'Table, partitioned table, view, materialized view or foreign table.'
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where c.relkind in ('r','p','v','m','f')
    and n.nspname not in ('pg_catalog','information_schema')
  union all
  select 13,'COLUMNS_AND_TYPES',row_number() over(order by n.nspname,c.relname,a.attnum),
    n.nspname,c.relname,'column',a.attname,
    format_type(a.atttypid,a.atttypmod),'INFO','INFO','Exact column type.'
  from pg_catalog.pg_attribute a
  join pg_catalog.pg_class c on c.oid=a.attrelid
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where a.attnum>0 and not a.attisdropped and c.relkind in ('r','p','v','m','f')
    and n.nspname not in ('pg_catalog','information_schema')
  union all
  select 14,'COLUMN_NULLABILITY',row_number() over(order by n.nspname,c.relname,a.attnum),
    n.nspname,c.relname,'column',a.attname,
    case when a.attnotnull then 'NOT NULL' else 'NULLABLE' end,
    'INFO','INFO','Column nullability.'
  from pg_catalog.pg_attribute a
  join pg_catalog.pg_class c on c.oid=a.attrelid
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where a.attnum>0 and not a.attisdropped and c.relkind in ('r','p')
    and n.nspname not in ('pg_catalog','information_schema')
  union all
  select 15,'COLUMN_DEFAULTS',row_number() over(order by n.nspname,c.relname,a.attnum),
    n.nspname,c.relname,'column',a.attname,
    coalesce(pg_catalog.pg_get_expr(d.adbin,d.adrelid),'NO DEFAULT'),
    'INFO','INFO','Column default expression.'
  from pg_catalog.pg_attribute a
  join pg_catalog.pg_class c on c.oid=a.attrelid
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
  where a.attnum>0 and not a.attisdropped and c.relkind in ('r','p')
    and n.nspname not in ('pg_catalog','information_schema')
  union all
  select 16,'GENERATED_AND_IDENTITY_COLUMNS',
    row_number() over(order by n.nspname,c.relname,a.attnum),
    n.nspname,c.relname,'column',a.attname,
    jsonb_build_object('generated',a.attgenerated,'identity',a.attidentity)::text,
    'INFO','INFO','Generated and identity metadata.'
  from pg_catalog.pg_attribute a
  join pg_catalog.pg_class c on c.oid=a.attrelid
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where a.attnum>0 and not a.attisdropped
    and (a.attgenerated<>'' or a.attidentity<>'')
    and n.nspname not in ('pg_catalog','information_schema')
  union all
  select
    case con.contype when 'p' then 17 when 'u' then 18 when 'f' then 19 else 20 end,
    case con.contype when 'p' then 'PRIMARY_KEYS' when 'u' then 'UNIQUE_CONSTRAINTS'
      when 'f' then 'FOREIGN_KEYS' else 'CHECK_CONSTRAINTS' end,
    row_number() over(partition by con.contype order by n.nspname,c.relname,con.conname),
    n.nspname,c.relname,'constraint',con.conname,
    pg_catalog.pg_get_constraintdef(con.oid,true),
    case when con.convalidated then 'PASS' else 'REVIEW' end,
    case when con.convalidated then 'INFO' else 'HIGH' end,
    'Exact constraint definition and validation state.'
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class c on c.oid=con.conrelid
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where con.contype in ('p','u','f','c')
    and n.nspname not in ('pg_catalog','information_schema')
  union all
  select 21,'INDEX_DEFINITIONS',row_number() over(order by object_schema,index_name),
    object_schema,index_name,'index','table',table_name,case when indisvalid and indisready then 'PASS' else 'BLOCKED' end,
    case when indisvalid and indisready then 'INFO' else 'CRITICAL' end,definition
  from index_meta
  union all
  select 22,'INDEX_UNIQUENESS',row_number() over(order by object_schema,index_name),
    object_schema,index_name,'index','is_unique',indisunique::text,'INFO','INFO',table_name
  from index_meta
  union all
  select 23,'INDEX_PREDICATES',row_number() over(order by object_schema,index_name),
    object_schema,index_name,'index','predicate',coalesce(predicate,'NONE'),'INFO','INFO',table_name
  from index_meta
  union all
  select 24,'INDEX_VALIDITY',row_number() over(order by object_schema,index_name),
    object_schema,index_name,'index','is_valid',indisvalid::text,
    case when indisvalid then 'PASS' else 'BLOCKED' end,
    case when indisvalid then 'INFO' else 'CRITICAL' end,table_name
  from index_meta
  union all
  select 25,'INDEX_READINESS',row_number() over(order by object_schema,index_name),
    object_schema,index_name,'index','is_ready',indisready::text,
    case when indisready then 'PASS' else 'BLOCKED' end,
    case when indisready then 'INFO' else 'CRITICAL' end,table_name
  from index_meta
  union all
  select 26,'INDEX_ACCESS_METHODS',row_number() over(order by object_schema,index_name),
    object_schema,index_name,'index','access_method',access_method,'INFO','INFO',table_name
  from index_meta
  union all
  select 27,'FUNCTIONS_AND_SIGNATURES',row_number() over(order by object_schema,signature),
    object_schema,signature,'function','safe_definition',safe_definition,'INFO','MEDIUM',
    'Definition with credential-like assignments redacted.'
  from function_meta
  union all
  select 28,'FUNCTION_OWNERS',row_number() over(order by object_schema,signature),
    object_schema,signature,'function','owner',owner_name,'INFO','INFO',null
  from function_meta
  union all
  select 29,'FUNCTION_LANGUAGES',row_number() over(order by object_schema,signature),
    object_schema,signature,'function','language',language_name,'INFO','INFO',null
  from function_meta
  union all
  select 30,'FUNCTION_VOLATILITY',row_number() over(order by object_schema,signature),
    object_schema,signature,'function','volatility',provolatile::text,'INFO','INFO',null
  from function_meta
  union all
  select 31,'FUNCTION_PARALLEL_SAFETY',row_number() over(order by object_schema,signature),
    object_schema,signature,'function','parallel_safety',proparallel::text,'INFO','INFO',null
  from function_meta
  union all
  select 32,'FUNCTION_SECURITY_MODE',row_number() over(order by object_schema,signature),
    object_schema,signature,'function','security_mode',
    case when prosecdef then 'SECURITY DEFINER' else 'SECURITY INVOKER' end,
    case when prosecdef then 'REVIEW' else 'INFO' end,
    case when prosecdef then 'HIGH' else 'INFO' end,null
  from function_meta
  union all
  select 33,'FUNCTION_SEARCH_PATH_CONFIG',row_number() over(order by object_schema,signature),
    object_schema,signature,'function','proconfig',coalesce(array_to_string(proconfig,','),'DEFAULT'),
    case when prosecdef and proconfig is null then 'WARNING' else 'INFO' end,
    case when prosecdef and proconfig is null then 'HIGH' else 'INFO' end,
    'SECURITY DEFINER routines require explicit review.'
  from function_meta
  union all
  select 34,'FUNCTION_ACLS',row_number() over(order by object_schema,object_name,grantee_name),
    object_schema,object_name,'function_acl',grantee_name,
    privilege_type||case when is_grantable then ' WITH GRANT OPTION' else '' end,
    case when grantee_name='PUBLIC' then 'BLOCKED' else 'REVIEW' end,
    case when grantee_name='PUBLIC' then 'CRITICAL' else 'MEDIUM' end,
    'Effective explicit/default routine ACL.'
  from function_acl_expanded
  union all
  select 35,'UNEXPECTED_OVERLOADS',row_number() over(order by object_schema,object_name),
    object_schema,object_name,'function_group','overload_count',overload_count::text,
    'REVIEW','HIGH','Multiple signatures require contract review.'
  from overload_groups
  union all
  select 36,'TABLES_WITH_RLS_ENABLED',row_number() over(order by n.nspname,c.relname),
    n.nspname,c.relname,'table','rls_enabled',c.relrowsecurity::text,
    'INFO','INFO','RLS enabled.'
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where c.relrowsecurity
  union all
  select 37,'TABLES_WITH_FORCE_RLS',row_number() over(order by n.nspname,c.relname),
    n.nspname,c.relname,'table','force_rls',c.relforcerowsecurity::text,
    'INFO','INFO','FORCE RLS enabled.'
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where c.relforcerowsecurity
  union all
  select 38,'RLS_POLICIES',row_number() over(order by object_schema,table_name,policy_name),
    object_schema,table_name,'policy',policy_name,
    jsonb_build_object('permissive',permissive,'roles',roles,'command',cmd,
      'using',qual,'with_check',with_check)::text,
    'REVIEW','MEDIUM','Complete policy metadata.'
  from policy_meta
  union all
  select 39,'POLICY_COMMAND_AND_ROLES',row_number() over(order by object_schema,table_name,policy_name),
    object_schema,table_name,'policy',policy_name,
    jsonb_build_object('command',cmd,'roles',roles)::text,'REVIEW','MEDIUM',null
  from policy_meta
  union all
  select 40,'POLICY_USING_CLAUSES',row_number() over(order by object_schema,table_name,policy_name),
    object_schema,table_name,'policy',policy_name,coalesce(qual,'NONE'),'REVIEW','MEDIUM',null
  from policy_meta
  union all
  select 41,'POLICY_WITH_CHECK_CLAUSES',row_number() over(order by object_schema,table_name,policy_name),
    object_schema,table_name,'policy',policy_name,coalesce(with_check,'NONE'),'REVIEW','MEDIUM',null
  from policy_meta
  union all
  select 42,'TRIGGERS',row_number() over(order by object_schema,table_name,trigger_name),
    object_schema,trigger_name,'trigger','table',table_name,'REVIEW','MEDIUM',definition
  from trigger_meta
  union all
  select 43,'TRIGGER_DEFINITIONS',row_number() over(order by object_schema,table_name,trigger_name),
    object_schema,trigger_name,'trigger','definition',definition,'REVIEW','MEDIUM',table_name
  from trigger_meta
  union all
  select 44,'TRIGGER_FUNCTION_LINKAGE',row_number() over(order by object_schema,table_name,trigger_name),
    object_schema,trigger_name,'trigger','function',trigger_function,'REVIEW','MEDIUM',table_name
  from trigger_meta
  union all
  select case when relkind='S' then 46 else 45 end,
    case when relkind='S' then 'SEQUENCE_ACLS' else 'TABLE_ACLS' end,
    row_number() over(partition by relkind='S' order by object_schema,object_name,grantee_name),
    object_schema,object_name,case when relkind='S' then 'sequence_acl' else 'table_acl' end,
    grantee_name,privilege_type||case when is_grantable then ' WITH GRANT OPTION' else '' end,
    case when grantee_name='PUBLIC' then 'BLOCKED' else 'REVIEW' end,
    case when grantee_name='PUBLIC' then 'CRITICAL' else 'MEDIUM' end,
    'Effective explicit/default ACL.'
  from acl_expanded
  union all
  select 47,'SCHEMA_ACLS',row_number() over(order by n.nspname,grantee_name),
    n.nspname,n.nspname,'schema_acl',grantee_name,x.privilege_type,
    case when grantee_name='PUBLIC' then 'REVIEW' else 'INFO' end,
    case when grantee_name='PUBLIC' then 'HIGH' else 'INFO' end,'Schema ACL.'
  from pg_catalog.pg_namespace n
  cross join lateral pg_catalog.aclexplode(
    coalesce(n.nspacl,pg_catalog.acldefault('n'::"char",n.nspowner))
  ) x
  left join lateral (
    select coalesce(r.rolname,'PUBLIC') grantee_name
    from (select x.grantee oid) g left join pg_catalog.pg_roles r on r.oid=g.oid
  ) grantee on true
  union all
  select 48,'DEFAULT_PRIVILEGES',row_number() over(order by n.nspname,r.rolname,d.defaclobjtype),
    coalesce(n.nspname,'GLOBAL'),r.rolname,'default_acl',d.defaclobjtype::text,
    d.defaclacl::text,'REVIEW','MEDIUM','Default privilege inventory.'
  from pg_catalog.pg_default_acl d
  join pg_catalog.pg_roles r on r.oid=d.defaclrole
  left join pg_catalog.pg_namespace n on n.oid=d.defaclnamespace
  union all
  select 49,'OBJECT_OWNERS',row_number() over(order by n.nspname,c.relname),
    n.nspname,c.relname,'relation','owner',r.rolname,'INFO','INFO',c.relkind::text
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  join pg_catalog.pg_roles r on r.oid=c.relowner
  where n.nspname not in ('pg_catalog','information_schema')
  union all
  select 50,'EXISTING_CORE_V2_TABLES',row_number() over(order by object_name),
    'public',object_name,'relation','collision','present','BLOCKED','HIGH',
    'Unexpected pre-install Core V2 relation.'
  from core_relation_collisions
  union all
  select 51,'EXISTING_CORE_V2_FUNCTIONS',row_number() over(order by signature),
    'public',signature,'function','collision','present','BLOCKED','HIGH',
    'Unexpected pre-install Core V2 function.'
  from core_function_collisions
  union all
  select 52,'EXISTING_CORE_V2_ROLES',row_number() over(order by rolname),
    null,rolname,'role','collision','present','BLOCKED','HIGH',
    'Unexpected pre-install Core V2 role.'
  from core_role_collisions
  union all
  select 53,'EXISTING_CORE_V2_TRIGGERS',row_number() over(order by trigger_name),
    'public',trigger_name,'trigger','collision','present','BLOCKED','HIGH',
    'Unexpected pre-install Core V2 trigger.'
  from core_trigger_collisions
  union all
  select 54,'EXISTING_CORE_V2_POLICIES',row_number() over(order by policy_name),
    'public',policy_name,'policy','collision','present','BLOCKED','HIGH',
    'Unexpected pre-install Core V2 policy.'
  from core_policy_collisions
  union all
  select 55,'ACTIVATION_CONFIGURATION_OBJECTS',row_number() over(order by c.relname),
    n.nspname,c.relname,'relation','presence','present','BLOCKED','HIGH',
    'Activation/configuration object exists before installation review.'
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public'
    and (c.relname like 'core_v2_%' or c.relname like '%activation%')
  union all
  select 56,'LEGACY_MUTATION_PATHS',row_number() over(order by object_schema,table_name,trigger_name),
    object_schema,trigger_name,'trigger','legacy_table',table_name,'REVIEW','HIGH',
    definition
  from trigger_meta
  where object_schema='public'
    and table_name in ('customers','orders','invoices','invoice_items',
      'inventory_stock','inventory_movements','order_number_sequences','audit_logs')
  union all
  select 57,'STORAGE_CONFIGURATION_METADATA',
    row_number() over(order by n.nspname,c.relname),
    n.nspname,c.relname,'storage_metadata','relkind',c.relkind::text,
    'INFO','MEDIUM','Storage schema object metadata only; no storage rows.'
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='storage'
  union all
  select 58,'DATA_READINESS_COUNTS',row_number() over(order by metric),
    'public',metric,'aggregate_count','count',value::text,
    case when metric='customers_total' or value=0 then 'INFO' else 'REVIEW' end,
    case when metric='customers_total' or value=0 then 'INFO' else 'HIGH' end,
    'Aggregate only; no business-row values.'
  from readiness_counts
  union all
  select 59,'BACKFILL_CANDIDATE_COUNTS',row_number() over(order by metric),
    'public',metric,'aggregate_count','candidate_count',value::text,
    case when value=0 then 'INFO' else 'REVIEW' end,
    case when value=0 then 'INFO' else 'HIGH' end,
    'Actual aggregate candidate count; review before any backfill.'
  from readiness_counts
  where metric like '%candidate%'
  union all
  select 60,'INVALID_NOT_READY_INDEX_SUMMARY',row_number() over(order by metric),
    null,metric,'summary','count',value::text,
    case when value=0 then 'PASS' else 'BLOCKED' end,
    severity,'Invalid/not-ready indexes are blocking.'
  from blocking_metrics
  where metric in ('invalid_index_count','not_ready_index_count')
  union all
  select 61,'UNSAFE_ROLE_ATTRIBUTE_SUMMARY',1,null,'unsafe_role_attribute_count',
    'summary','count',value::text,case when value=0 then 'PASS' else 'BLOCKED' end,
    severity,'Unexpected superuser, BYPASSRLS or replication attributes.'
  from blocking_metrics where metric='unsafe_role_attribute_count'
  union all
  select 62,'PUBLIC_EXPOSURE_SUMMARY',1,null,'public_exposure_count','summary',
    'count',value::text,case when value=0 then 'PASS' else 'BLOCKED' end,severity,
    'PUBLIC table/sequence/function exposure requires external review.'
  from blocking_metrics where metric='public_exposure_count'
  union all
  select 63,'SERVICE_ROLE_EXPOSURE_SUMMARY',1,null,
    'service_role_exposure_requiring_review','summary','count',value::text,
    'REVIEW',severity,'service_role exposure is not automatic approval.'
  from blocking_metrics where metric='service_role_exposure_requiring_review'
  union all
  select 64,'DUPLICATE_OVERLOAD_SUMMARY',row_number() over(order by metric),
    null,metric,'summary','count',value::text,
    case when value=0 then 'PASS' else 'BLOCKED' end,severity,
    'Unexpected future-contract overloads are blocking.'
  from blocking_metrics where metric='unexpected_overload_count'
  union all
  select 65,'FINAL_BLOCKING_SUMMARY',row_number() over(order by metric),
    null,metric,'blocking_metric','count',value::text,
    case when metric='service_role_exposure_requiring_review' then 'REVIEW'
      when value=0 then 'PASS' else 'BLOCKED' end,
    severity,'External reviewer must classify and resolve every nonzero issue.'
  from blocking_metrics
),
wrapped_report as (
  select
    r.section_order,r.section_name,r.item_order,r.object_schema,r.object_name,
    r.object_type,r.attribute_name,r.attribute_value,r.status,r.severity,r.notes
  from report_rows r
  union all
  select
    s.section_order,s.section_name,1,null,null,'section_status','result_count','0',
    'EMPTY','INFO','This section returned no matching objects.'
  from section_catalog s
  where not exists (
    select 1 from report_rows r where r.section_order=s.section_order
  )
),
final_metrics as (
  select
    coalesce(sum(value) filter (
      where metric<>'service_role_exposure_requiring_review'
    ),0)::bigint total_blocking,
    coalesce(max(value) filter (
      where metric='service_role_exposure_requiring_review'
    ),0)::bigint service_review
  from blocking_metrics
),
final_report as (
  select * from wrapped_report
  union all
  select
    66,'FINAL_PREFLIGHT_DECISION',1,null,'FINAL_PREFLIGHT_DECISION',
    'decision','total_blocking_issue_count',total_blocking::text,
    case when total_blocking>0 then 'BLOCKED' else 'REVIEW_REQUIRED' end,
    case when total_blocking>0 then 'CRITICAL' else 'HIGH' end,
    case
      when total_blocking>0 then
        'Blocking metadata findings exist. External remediation review is required.'
      when service_review>0 then
        'No counted blocker, but service_role exposure requires external review.'
      else
        'Metadata review is complete; only an external reviewer may authorize continuation.'
    end
  from final_metrics
)
select
  section_order,
  section_name,
  item_order::integer as item_order,
  object_schema,
  object_name,
  object_type,
  attribute_name,
  attribute_value,
  status,
  severity,
  notes
from final_report
order by
  section_order,
  item_order,
  object_schema nulls first,
  object_name nulls first,
  attribute_name nulls first;
