# Prompt 10 query plan and allowlist

This plan was frozen before the first Production SQL statement. Every SQL item below is executed as an independent explicit `READ ONLY` transaction with bounded local timeouts. No query calls an application function. Catalog formatter functions (`pg_get_expr`, `pg_get_constraintdef`, `pg_get_indexdef`, `pg_get_triggerdef`, `pg_get_function_identity_arguments`, and `pg_get_function_result`) format catalog values only; no function body is executed.

Common transaction envelope for `P10-Q001` through `P10-Q011`:

```sql
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '8000ms';
SET LOCAL lock_timeout = '1000ms';
SET LOCAL idle_in_transaction_session_timeout = '12000ms';
-- exactly one SELECT from the per-query body below
ROLLBACK;
```

## Non-SQL management-plane reads

| ID | Classification | Operation | Purpose |
|---|---|---|---|
| P10-M001 | CATALOG_ONLY | `list_projects` | Establish the intended non-secret AFEX Production project identity before SQL. |
| P10-M002 | CATALOG_ONLY | `list_extensions(project_id)` | Record installed extension names and versions without reading `pg_extension`, which is outside the SQL allowlist. |

## Exact SQL bodies

### P10-Q001 — CATALOG_ONLY — connection/read-only identity

```sql
SELECT pg_catalog.jsonb_build_object(
  'serverVersion', pg_catalog.version(),
  'serverVersionNum', pg_catalog.current_setting('server_version_num'),
  'database', pg_catalog.current_database(),
  'currentUser', CURRENT_USER,
  'sessionUser', SESSION_USER,
  'currentRole', CURRENT_ROLE,
  'transactionReadOnly', pg_catalog.current_setting('transaction_read_only')::boolean,
  'defaultTransactionReadOnly', pg_catalog.current_setting('default_transaction_read_only')::boolean,
  'searchPath', pg_catalog.current_setting('search_path')
) AS evidence;
```

### P10-Q002 — CATALOG_ONLY — roles and memberships

```sql
WITH selected_roles AS (
  SELECT oid, rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb,
         rolcanlogin, rolreplication, rolbypassrls, rolconnlimit
  FROM pg_catalog.pg_roles
  WHERE rolname IN ('postgres','anon','authenticated','service_role','authenticator','supabase_admin','supabase_auth_admin','supabase_storage_admin','dashboard_user')
     OR rolname LIKE 'afex_%'
), memberships AS (
  SELECT member_role.rolname AS member, granted_role.rolname AS granted_role,
         grantor_role.rolname AS grantor, m.admin_option, m.inherit_option, m.set_option
  FROM pg_catalog.pg_auth_members m
  JOIN pg_catalog.pg_roles member_role ON member_role.oid = m.member
  JOIN pg_catalog.pg_roles granted_role ON granted_role.oid = m.roleid
  JOIN pg_catalog.pg_roles grantor_role ON grantor_role.oid = m.grantor
  WHERE member_role.oid IN (SELECT oid FROM selected_roles)
     OR granted_role.oid IN (SELECT oid FROM selected_roles)
)
SELECT pg_catalog.jsonb_build_object(
  'roles', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) ORDER BY r.rolname) FROM selected_roles r), '[]'::jsonb),
  'memberships', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(m) ORDER BY m.member,m.granted_role,m.grantor) FROM memberships m), '[]'::jsonb)
) AS evidence;
```

### P10-Q003 — CATALOG_ONLY — namespaces and default ACLs

```sql
WITH schemas AS (
  SELECT n.oid, n.nspname, r.rolname AS owner, n.nspacl::text AS raw_acl
  FROM pg_catalog.pg_namespace n
  JOIN pg_catalog.pg_roles r ON r.oid = n.nspowner
  WHERE n.nspname IN ('public','private','afex_pos_authority','auth')
), defaults AS (
  SELECT d.oid, owner.rolname AS owner, n.nspname AS schema_name,
         d.defaclobjtype, d.defaclacl::text AS raw_acl
  FROM pg_catalog.pg_default_acl d
  JOIN pg_catalog.pg_roles owner ON owner.oid = d.defaclrole
  LEFT JOIN pg_catalog.pg_namespace n ON n.oid = d.defaclnamespace
  WHERE n.nspname IN ('public','private','afex_pos_authority','auth')
     OR owner.rolname LIKE 'afex_%'
     OR owner.rolname IN ('postgres','supabase_admin')
)
SELECT pg_catalog.jsonb_build_object(
  'schemas', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(s) ORDER BY s.nspname) FROM schemas s), '[]'::jsonb),
  'defaultAcls', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(d) ORDER BY d.owner,d.schema_name,d.defaclobjtype) FROM defaults d), '[]'::jsonb)
) AS evidence;
```

### P10-Q004 — CATALOG_ONLY — relevant relation inventory and estimated size

```sql
WITH relevant AS (
  SELECT c.oid, n.nspname AS schema_name, c.relname, c.relkind,
         owner.rolname AS owner, c.relrowsecurity, c.relforcerowsecurity,
         c.relreplident, c.reltuples::bigint AS estimated_rows,
         CASE WHEN c.relkind IN ('r','p','m','i','I','S','t') THEN pg_catalog.pg_total_relation_size(c.oid) ELSE 0 END AS total_bytes,
         c.relacl::text AS raw_acl
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_catalog.pg_roles owner ON owner.oid = c.relowner
  WHERE n.nspname IN ('public','private','afex_pos_authority')
    AND (
      c.relname IN ('profiles','pos_profiles','tenants','branches','customers','customer_phone_identities','customer_phone_identity_members','inventory_stock','inventory_movements','inventory_movements_view','branch_catalog_items','catalog_items','orders','invoices','invoice_items','order_status_logs','audit_logs','vat_settings','branch_whatsapp_configs','actor_sessions','auth_session_locks','atomic_authorization_contexts','atomic_order_commands','atomic_order_command_payloads','atomic_order_claims','atomic_order_retry_authorizations','atomic_order_business_links','atomic_order_line_links','atomic_order_audit','atomic_order_diagnostics','order_number_sequences')
      OR c.relname ~* '(offline|device|snapshot|frontier|review|reconcil|payment|refund|effect|whatsapp|notification|atomic_order|pos_)'
    )
)
SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) ORDER BY r.schema_name,r.relname), '[]'::jsonb) AS evidence
FROM relevant r;
```

### P10-Q005 — CATALOG_ONLY — columns, keys, indexes, and triggers

```sql
WITH relevant_relations AS (
  SELECT c.oid, n.nspname AS schema_name, c.relname
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('public','private','afex_pos_authority')
    AND (
      c.relname IN ('profiles','pos_profiles','tenants','branches','customers','customer_phone_identities','customer_phone_identity_members','inventory_stock','inventory_movements','inventory_movements_view','branch_catalog_items','catalog_items','orders','invoices','invoice_items','order_status_logs','audit_logs','vat_settings','branch_whatsapp_configs','actor_sessions','auth_session_locks','atomic_authorization_contexts','atomic_order_commands','atomic_order_command_payloads','atomic_order_claims','atomic_order_retry_authorizations','atomic_order_business_links','atomic_order_line_links','atomic_order_audit','atomic_order_diagnostics','order_number_sequences')
      OR c.relname ~* '(offline|device|snapshot|frontier|review|reconcil|payment|refund|effect|whatsapp|notification|atomic_order|pos_)'
    )
), columns AS (
  SELECT r.schema_name, r.relname, a.attnum, a.attname,
         pg_catalog.format_type(a.atttypid,a.atttypmod) AS data_type,
         a.attnotnull, a.attidentity, a.attgenerated,
         CASE WHEN d.oid IS NULL THEN NULL ELSE pg_catalog.pg_get_expr(d.adbin,d.adrelid) END AS default_expression
  FROM relevant_relations r
  JOIN pg_catalog.pg_attribute a ON a.attrelid=r.oid AND a.attnum>0 AND NOT a.attisdropped
  LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid=r.oid AND d.adnum=a.attnum
), constraints AS (
  SELECT r.schema_name, r.relname, c.conname, c.contype, c.condeferrable,
         c.condeferred, c.convalidated, c.conkey::text, c.confkey::text,
         rn.nspname AS referenced_schema, rc.relname AS referenced_relation,
         pg_catalog.pg_get_constraintdef(c.oid,true) AS definition
  FROM relevant_relations r
  JOIN pg_catalog.pg_constraint c ON c.conrelid=r.oid
  LEFT JOIN pg_catalog.pg_class rc ON rc.oid=c.confrelid
  LEFT JOIN pg_catalog.pg_namespace rn ON rn.oid=rc.relnamespace
), indexes AS (
  SELECT r.schema_name, r.relname, ic.relname AS index_name, i.indisunique,
         i.indisprimary, i.indisvalid, i.indisready,
         pg_catalog.pg_get_indexdef(i.indexrelid) AS definition
  FROM relevant_relations r
  JOIN pg_catalog.pg_index i ON i.indrelid=r.oid
  JOIN pg_catalog.pg_class ic ON ic.oid=i.indexrelid
), triggers AS (
  SELECT r.schema_name, r.relname, t.tgname, t.tgenabled,
         pns.nspname AS function_schema, p.proname AS function_name,
         pg_catalog.pg_get_triggerdef(t.oid,true) AS definition
  FROM relevant_relations r
  JOIN pg_catalog.pg_trigger t ON t.tgrelid=r.oid AND NOT t.tgisinternal
  JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid
  JOIN pg_catalog.pg_namespace pns ON pns.oid=p.pronamespace
)
SELECT pg_catalog.jsonb_build_object(
 'columns',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(c) ORDER BY c.schema_name,c.relname,c.attnum) FROM columns c),'[]'::jsonb),
 'constraints',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(c) ORDER BY c.schema_name,c.relname,c.conname) FROM constraints c),'[]'::jsonb),
 'indexes',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(i) ORDER BY i.schema_name,i.relname,i.index_name) FROM indexes i),'[]'::jsonb),
 'triggers',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) ORDER BY t.schema_name,t.relname,t.tgname) FROM triggers t),'[]'::jsonb)
) AS evidence;
```

### P10-Q006 — CATALOG_ONLY — RLS policies

```sql
SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
  'schema',n.nspname,'relation',c.relname,'policy',p.polname,
  'command',p.polcmd,'permissive',p.polpermissive,
  'roles',p.polroles::text,
  'usingExpression',pg_catalog.pg_get_expr(p.polqual,p.polrelid),
  'checkExpression',pg_catalog.pg_get_expr(p.polwithcheck,p.polrelid)
) ORDER BY n.nspname,c.relname,p.polname), '[]'::jsonb) AS evidence
FROM pg_catalog.pg_policy p
JOIN pg_catalog.pg_class c ON c.oid=p.polrelid
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN ('public','private','afex_pos_authority')
  AND (
    c.relname IN ('profiles','pos_profiles','tenants','branches','customers','customer_phone_identities','customer_phone_identity_members','inventory_stock','inventory_movements','inventory_movements_view','branch_catalog_items','catalog_items','orders','invoices','invoice_items','order_status_logs','audit_logs','vat_settings','branch_whatsapp_configs','actor_sessions','auth_session_locks','atomic_authorization_contexts','atomic_order_commands','atomic_order_command_payloads','atomic_order_claims','atomic_order_retry_authorizations','atomic_order_business_links','atomic_order_line_links','atomic_order_audit','atomic_order_diagnostics','order_number_sequences')
    OR c.relname ~* '(offline|device|snapshot|frontier|review|reconcil|payment|refund|effect|whatsapp|notification|atomic_order|pos_)'
  );
```

### P10-Q007 — CATALOG_ONLY — relevant function authority and body identity

```sql
WITH relevant AS (
 SELECT p.oid, n.nspname AS schema_name, p.proname,
        pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
        pg_catalog.pg_get_function_result(p.oid) AS result_type,
        owner.rolname AS owner, lang.lanname AS language,
        p.prokind, p.prosecdef, p.proleakproof, p.proisstrict,
        p.provolatile, p.proparallel, p.procost, p.prorows,
        p.proconfig, p.proacl::text AS raw_acl,
        pg_catalog.md5(p.prosrc) AS body_md5,
        pg_catalog.length(p.prosrc) AS body_length
 FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 JOIN pg_catalog.pg_roles owner ON owner.oid=p.proowner
 JOIN pg_catalog.pg_language lang ON lang.oid=p.prolang
 WHERE n.nspname IN ('public','private','afex_pos_authority')
   AND (
     p.proname IN ('lookup_customer_by_normalized_phone','create_customer_with_phone_identity','verify_pos_pin_for_actor','set_pos_pin','hash_pos_pin','issue_actor_session','validate_actor_session','revoke_actor_session','revoke_actor_sessions_for_actor','actor_session_state','cleanup_actor_sessions','acquire_atomic_order_command_v1','acquire_atomic_order_command_result_v1','claim_atomic_order_command_v1','execute_atomic_order_command_v1','replay_atomic_order_command_v1','create_invoice_with_items','create_invoice_with_items_safe','adjust_inventory_stock','restore_inventory_for_cancelled_invoice','next_branch_monthly_order_number')
     OR p.proname ~* '(offline|device|snapshot|frontier|review|reconcil|payment|refund|effect|whatsapp|notification|atomic_order|pos_actor|actor_session|inventory)'
   )
)
SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) ORDER BY r.schema_name,r.proname,r.identity_arguments), '[]'::jsonb) AS evidence
FROM relevant r;
```

Historical adjudication: this query completed read-only but failed the relation allowlist because it joined `pg_catalog.pg_language`. It remains recorded and is not reclassified.

### P10-Q007R — CATALOG_ONLY — allowlisted function authority correction

The human owner authorized this exact one-time corrective transaction. It was the only new Production request:

```sql
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '8000ms';
SET LOCAL lock_timeout = '1000ms';
SET LOCAL idle_in_transaction_session_timeout = '12000ms';

WITH relevant AS (
    SELECT
        p.oid,
        n.nspname AS schema_name,
        p.proname,
        pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
        pg_catalog.pg_get_function_result(p.oid) AS result_type,
        owner.rolname AS owner,
        p.prolang AS language_oid,
        p.prokind,
        p.prosecdef,
        p.proleakproof,
        p.proisstrict,
        p.provolatile,
        p.proparallel,
        p.procost,
        p.prorows,
        p.proconfig,
        p.proacl::text AS raw_acl,
        pg_catalog.md5(p.prosrc) AS body_md5,
        pg_catalog.length(p.prosrc) AS body_length
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n
      ON n.oid = p.pronamespace
    JOIN pg_catalog.pg_roles AS owner
      ON owner.oid = p.proowner
    WHERE n.nspname IN ('public','private','afex_pos_authority')
      AND (
        p.proname IN (
          'lookup_customer_by_normalized_phone',
          'create_customer_with_phone_identity',
          'verify_pos_pin_for_actor',
          'set_pos_pin',
          'hash_pos_pin',
          'issue_actor_session',
          'validate_actor_session',
          'revoke_actor_session',
          'revoke_actor_sessions_for_actor',
          'actor_session_state',
          'cleanup_actor_sessions',
          'acquire_atomic_order_command_v1',
          'acquire_atomic_order_command_result_v1',
          'claim_atomic_order_command_v1',
          'execute_atomic_order_command_v1',
          'replay_atomic_order_command_v1',
          'create_invoice_with_items',
          'create_invoice_with_items_safe',
          'adjust_inventory_stock',
          'restore_inventory_for_cancelled_invoice',
          'next_branch_monthly_order_number'
        )
        OR p.proname ~* '(offline|device|snapshot|frontier|review|reconcil|payment|refund|effect|whatsapp|notification|atomic_order|pos_actor|actor_session|inventory)'
      )
)
SELECT pg_catalog.jsonb_build_object(
    'queryId', 'P10-Q007R',
    'transactionReadOnly',
        pg_catalog.current_setting('transaction_read_only')::boolean,
    'functions',
        COALESCE(
            (
                SELECT pg_catalog.jsonb_agg(
                    pg_catalog.to_jsonb(r)
                    ORDER BY r.schema_name, r.proname, r.identity_arguments
                )
                FROM relevant AS r
            ),
            '[]'::jsonb
        )
) AS evidence;

ROLLBACK;
```

Execution result: one result row; `transactionReadOnly=true`; 36 functions; `pg_proc`, `pg_namespace`, and `pg_roles` only; transaction completed through `ROLLBACK`.

### P10-Q008 — CATALOG_ONLY — dependency closure

```sql
WITH relevant_functions AS (
 SELECT p.oid, n.nspname AS schema_name, p.proname,
        pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments
 FROM pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname IN ('public','private','afex_pos_authority')
   AND (p.proname ~* '(offline|device|snapshot|frontier|review|reconcil|payment|refund|effect|whatsapp|notification|atomic_order|pos_actor|actor_session|inventory)'
        OR p.proname IN ('lookup_customer_by_normalized_phone','create_customer_with_phone_identity','create_invoice_with_items','create_invoice_with_items_safe'))
), deps AS (
 SELECT f.schema_name, f.proname, f.identity_arguments, d.deptype,
        d.refclassid::regclass::text AS referenced_catalog,
        CASE WHEN d.refclassid='pg_catalog.pg_class'::regclass THEN rn.nspname||'.'||rc.relname
             WHEN d.refclassid='pg_catalog.pg_proc'::regclass THEN rpn.nspname||'.'||rp.proname
             WHEN d.refclassid='pg_catalog.pg_namespace'::regclass THEN ns.nspname
             ELSE d.refobjid::text END AS referenced_object
 FROM relevant_functions f
 JOIN pg_catalog.pg_depend d ON d.classid='pg_catalog.pg_proc'::regclass AND d.objid=f.oid
 LEFT JOIN pg_catalog.pg_class rc ON d.refclassid='pg_catalog.pg_class'::regclass AND rc.oid=d.refobjid
 LEFT JOIN pg_catalog.pg_namespace rn ON rn.oid=rc.relnamespace
 LEFT JOIN pg_catalog.pg_proc rp ON d.refclassid='pg_catalog.pg_proc'::regclass AND rp.oid=d.refobjid
 LEFT JOIN pg_catalog.pg_namespace rpn ON rpn.oid=rp.pronamespace
 LEFT JOIN pg_catalog.pg_namespace ns ON d.refclassid='pg_catalog.pg_namespace'::regclass AND ns.oid=d.refobjid
)
SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(d) ORDER BY d.schema_name,d.proname,d.identity_arguments,d.referenced_catalog,d.referenced_object), '[]'::jsonb) AS evidence
FROM deps d;
```

### P10-Q009 — PRIVILEGE_ONLY — effective schema/table/sequence/function reachability

```sql
WITH roles AS (
 SELECT rolname FROM pg_catalog.pg_roles
 WHERE rolname IN ('postgres','anon','authenticated','service_role','authenticator','supabase_admin','supabase_auth_admin','supabase_storage_admin')
    OR rolname LIKE 'afex_%'
), schemas AS (
 SELECT r.rolname AS role_name, n.nspname AS schema_name,
        pg_catalog.has_schema_privilege(r.rolname,n.oid,'USAGE') AS can_usage,
        pg_catalog.has_schema_privilege(r.rolname,n.oid,'CREATE') AS can_create
 FROM roles r CROSS JOIN pg_catalog.pg_namespace n
 WHERE n.nspname IN ('public','private','afex_pos_authority','auth')
), relations AS (
 SELECT r.rolname AS role_name, n.nspname AS schema_name, c.relname,
        pg_catalog.has_table_privilege(r.rolname,c.oid,'SELECT') AS can_select,
        pg_catalog.has_table_privilege(r.rolname,c.oid,'INSERT') AS can_insert,
        pg_catalog.has_table_privilege(r.rolname,c.oid,'UPDATE') AS can_update,
        pg_catalog.has_table_privilege(r.rolname,c.oid,'DELETE') AS can_delete
 FROM roles r CROSS JOIN pg_catalog.pg_class c
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN ('public','private','afex_pos_authority')
   AND c.relkind IN ('r','p','v','m')
   AND (c.relname IN ('profiles','pos_profiles','branches','customers','customer_phone_identities','inventory_stock','inventory_movements','inventory_movements_view','orders','invoices','invoice_items','actor_sessions','atomic_order_commands')
        OR c.relname ~* '(offline|device|snapshot|frontier|review|reconcil|payment|refund|effect)')
), functions AS (
 SELECT r.rolname AS role_name, n.nspname AS schema_name, p.proname,
        pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
        pg_catalog.has_function_privilege(r.rolname,p.oid,'EXECUTE') AS can_execute
 FROM roles r CROSS JOIN pg_catalog.pg_proc p
 JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname IN ('public','private','afex_pos_authority')
   AND (p.proname IN ('lookup_customer_by_normalized_phone','create_customer_with_phone_identity','verify_pos_pin_for_actor','set_pos_pin','issue_actor_session','validate_actor_session','revoke_actor_session','acquire_atomic_order_command_v1','execute_atomic_order_command_v1','replay_atomic_order_command_v1','create_invoice_with_items','create_invoice_with_items_safe','adjust_inventory_stock','restore_inventory_for_cancelled_invoice')
        OR p.proname ~* '(offline|snapshot|review|effect)')
), sequences AS (
 SELECT r.rolname AS role_name, n.nspname AS schema_name, c.relname,
        pg_catalog.has_sequence_privilege(r.rolname,c.oid,'USAGE') AS can_usage,
        pg_catalog.has_sequence_privilege(r.rolname,c.oid,'SELECT') AS can_select,
        pg_catalog.has_sequence_privilege(r.rolname,c.oid,'UPDATE') AS can_update
 FROM roles r CROSS JOIN pg_catalog.pg_class c
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE c.relkind='S' AND n.nspname IN ('public','private','afex_pos_authority')
)
SELECT pg_catalog.jsonb_build_object(
 'schemas',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(s) ORDER BY s.role_name,s.schema_name) FROM schemas s),'[]'::jsonb),
 'relations',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(t) ORDER BY t.role_name,t.schema_name,t.relname) FROM relations t),'[]'::jsonb),
 'functions',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(f) ORDER BY f.role_name,f.schema_name,f.proname,f.identity_arguments) FROM functions f),'[]'::jsonb),
 'sequences',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(q) ORDER BY q.role_name,q.schema_name,q.relname) FROM sequences q),'[]'::jsonb)
) AS evidence;
```

### P10-Q010 — AGGREGATE_INTEGRITY_ONLY — branch/tenant integrity

```sql
WITH duplicate_groups AS (
 SELECT id, tenant_id, count(*) AS copies
 FROM public.branches
 GROUP BY id, tenant_id
 HAVING count(*) > 1
)
SELECT pg_catalog.jsonb_build_object(
 'relation','public.branches',
 'totalRows',(SELECT count(*) FROM public.branches),
 'nullTenantRows',(SELECT count(*) FROM public.branches WHERE tenant_id IS NULL),
 'duplicateCompositeGroups',(SELECT count(*) FROM duplicate_groups),
 'maxDuplicateCopies',COALESCE((SELECT max(copies) FROM duplicate_groups),0),
 'orphanTenantRows',(SELECT count(*) FROM public.branches b WHERE b.tenant_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.tenants t WHERE t.id=b.tenant_id))
) AS evidence;
```

### P10-Q011 — AGGREGATE_INTEGRITY_ONLY — payment vocabulary

```sql
WITH vocabulary AS (
 SELECT COALESCE(payment_method::text,'<NULL>') AS payment_method, count(*) AS row_count
 FROM public.invoices
 GROUP BY COALESCE(payment_method::text,'<NULL>')
)
SELECT pg_catalog.jsonb_build_object(
 'relation','public.invoices',
 'column','payment_method',
 'vocabulary',COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(v) ORDER BY v.payment_method),'[]'::jsonb)
) AS evidence
FROM vocabulary v;
```

## Allowlist adjudication

- `P10-Q001`–`P10-Q006` and `P10-Q008`: `CATALOG_ONLY` and relation-allowlisted.
- Historical `P10-Q007`: operationally read-only and catalog-only, but **NOT relation-allowlisted** because it directly read `pg_catalog.pg_language`. The event remains an allowlist failure.
- Corrective `P10-Q007R`: `CATALOG_ONLY` and relation-allowlisted; reads only `pg_proc`, `pg_namespace`, and `pg_roles`, returns `language_oid` without resolving a language name, and matches 36/36 historical function identities and authority properties.
- `P10-Q009`: `PRIVILEGE_ONLY` using only the approved `has_*_privilege` family.
- `P10-Q010`–`P10-Q011`: `AGGREGATE_INTEGRITY_ONLY`; output is counts/classification vocabulary only.
- `P10-M001`–`P10-M002`: non-SQL management-plane metadata reads.
- No raw business row, UUID sample, PII, payment reference, ciphertext, PIN material, application function call, row lock, advisory lock, DDL, DML, DCL, configuration mutation, or effect dispatch is present.
- `P10-Q011` is conditional: it runs only if `P10-Q005` proves `public.invoices.payment_method` exists. No unplanned diagnostic query will be substituted on failure.

## Post-execution fail-closed decision

The frozen original plan should have rejected `P10-Q007` before execution, and that read of `pg_language` is not retroactively reclassified. The separately authorized exact `P10-Q007R` transaction corrected the missing allowlisted evidence with one SELECT, `transactionReadOnly=true`, and `ROLLBACK`. It was the only request under the correction authorization; that authorization has expired and no additional Production access is permitted.
