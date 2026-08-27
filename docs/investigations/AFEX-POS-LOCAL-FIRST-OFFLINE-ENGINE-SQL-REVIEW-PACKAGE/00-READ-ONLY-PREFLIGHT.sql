/*
classification: READ_ONLY_PREFLIGHT
wave: 0
purpose: Capture catalog-only identity and drift evidence before any authority mutation.
execution status: NOT AUTHORIZED
prerequisites: Independent human review; manually selected non-Production target; frozen evidence identities available to the operator.
expected owner/operator: PostgreSQL catalog reader approved by the future human operator.
transaction behavior: One explicit READ ONLY transaction ending in ROLLBACK.
lock risk: Catalog ACCESS SHARE only; pg_locks and relation-size inspection are non-mutating.
retry behavior: Stop on any error or identity mismatch; never retry by weakening predicates.
rollback reference: SQL-REVIEW-ROLLBACK-CONTRACT.md; no data change is possible in this file.
required evidence before execution: Prompt 9 compatibility approval, independent SQL approval, target identity, and a fresh frozen catalog capture.
*/

-- block: READ_ONLY_PREFLIGHT / connection identity
BEGIN TRANSACTION READ ONLY;

SELECT
    pg_catalog.version() AS postgres_version,
    pg_catalog.current_database() AS database_name,
    current_user AS current_role,
    session_user AS session_role,
    pg_catalog.current_setting('server_version_num') AS server_version_num;

-- block: READ_ONLY_PREFLIGHT / role attributes and memberships
SELECT
    r.rolname,
    r.rolsuper,
    r.rolinherit,
    r.rolcreaterole,
    r.rolcreatedb,
    r.rolcanlogin,
    r.rolreplication,
    r.rolbypassrls,
    r.rolconnlimit
FROM pg_catalog.pg_roles AS r
WHERE r.rolname = ANY (ARRAY[
    'postgres','authenticator','anon','authenticated','service_role',
    'afex_identity_owner','afex_business_owner','afex_inventory_owner',
    'afex_audit_owner','afex_core_owner','afex_function_owner',
    'afex_pos_session_owner','afex_offline_authority_owner',
    'afex_review_owner','afex_effect_owner','afex_core_runtime',
    'afex_pos_session_maintenance','afex_reconciliation_authority',
    'afex_offline_enrollment_runtime','afex_offline_acquisition_runtime',
    'afex_business_review_runtime','afex_effect_dispatcher',
    'afex_inventory_admin_runtime'
]::pg_catalog.name[])
ORDER BY r.rolname;

SELECT
    member_role.rolname AS member_role,
    granted_role.rolname AS granted_role,
    grantor_role.rolname AS grantor_role,
    m.admin_option,
    m.inherit_option,
    m.set_option
FROM pg_catalog.pg_auth_members AS m
JOIN pg_catalog.pg_roles AS member_role ON member_role.oid = m.member
JOIN pg_catalog.pg_roles AS granted_role ON granted_role.oid = m.roleid
JOIN pg_catalog.pg_roles AS grantor_role ON grantor_role.oid = m.grantor
WHERE member_role.rolname LIKE 'afex\_%' ESCAPE '\'
   OR granted_role.rolname LIKE 'afex\_%' ESCAPE '\'
   OR member_role.rolname = ANY (ARRAY['anon','authenticated','service_role']::pg_catalog.name[])
ORDER BY member_role.rolname, granted_role.rolname, grantor_role.rolname;

-- block: READ_ONLY_PREFLIGHT / schemas, owners, raw ACL and default ACL
SELECT
    n.oid,
    n.nspname,
    owner_role.rolname AS owner,
    n.nspacl,
    pg_catalog.aclexplode(COALESCE(n.nspacl, pg_catalog.acldefault('n', n.nspowner)))
FROM pg_catalog.pg_namespace AS n
JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = n.nspowner
WHERE n.nspname = ANY (ARRAY[
    'public','afex_core_private','afex_pos_authority',
    'afex_offline_authority','afex_review_private','afex_effect_private'
]::pg_catalog.name[])
ORDER BY n.nspname;

SELECT
    owner_role.rolname AS owner,
    n.nspname AS schema_name,
    d.defaclobjtype,
    d.defaclacl,
    pg_catalog.aclexplode(d.defaclacl)
FROM pg_catalog.pg_default_acl AS d
JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = d.defaclrole
LEFT JOIN pg_catalog.pg_namespace AS n ON n.oid = d.defaclnamespace
WHERE n.nspname = ANY (ARRAY[
    'public','afex_core_private','afex_pos_authority',
    'afex_offline_authority','afex_review_private','afex_effect_private'
]::pg_catalog.name[])
   OR owner_role.rolname LIKE 'afex\_%' ESCAPE '\'
ORDER BY owner_role.rolname, n.nspname NULLS FIRST, d.defaclobjtype;

-- block: READ_ONLY_PREFLIGHT / relation owners, ACL, RLS, sizes and persistence
SELECT
    n.nspname AS schema_name,
    c.relname,
    c.relkind,
    owner_role.rolname AS owner,
    c.relrowsecurity,
    c.relforcerowsecurity,
    c.relpersistence,
    c.relreplident,
    c.relacl,
    pg_catalog.pg_total_relation_size(c.oid) AS total_bytes,
    pg_catalog.obj_description(c.oid, 'pg_class') AS catalog_comment
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = c.relowner
WHERE n.nspname = ANY (ARRAY[
    'public','afex_core_private','afex_pos_authority',
    'afex_offline_authority','afex_review_private','afex_effect_private'
]::pg_catalog.name[])
AND (
    c.relname = ANY (ARRAY[
        'profiles','pos_profiles','tenants','branches','customers','catalog_items',
        'branch_catalog_items','orders','invoices','invoice_items','order_status_logs',
        'order_number_sequences','vat_settings','audit_logs','branch_whatsapp_configs',
        'inventory_stock','inventory_movements','inventory_movements_view',
        'customer_phone_identities','customer_phone_identity_members',
        'invoice_number_seq','order_number_seq','atomic_authorization_contexts',
        'atomic_order_commands','atomic_order_command_payloads','atomic_order_claims',
        'atomic_order_retry_authorizations','atomic_order_business_links',
        'atomic_order_line_links','atomic_order_audit','atomic_order_diagnostics',
        'actor_sessions','auth_session_locks','offline_devices','offline_device_events',
        'offline_employee_authorities','offline_key_envelopes','offline_command_bindings',
        'atomic_business_reviews','atomic_business_review_events',
        'atomic_payment_attestations','branch_inventory_snapshot_headers',
        'branch_inventory_snapshot_items','atomic_effect_ledger'
    ]::pg_catalog.name[])
)
ORDER BY n.nspname, c.relname;

-- block: READ_ONLY_PREFLIGHT / exact policies
SELECT
    n.nspname AS schema_name,
    c.relname AS table_name,
    p.polname,
    CASE WHEN p.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END AS policy_mode,
    p.polcmd,
    ARRAY(
        SELECT role_item.rolname
        FROM pg_catalog.unnest(p.polroles) AS policy_role(oid)
        JOIN pg_catalog.pg_roles AS role_item ON role_item.oid = policy_role.oid
        ORDER BY role_item.rolname
    ) AS roles,
    pg_catalog.pg_get_expr(p.polqual, p.polrelid) AS using_expression,
    pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) AS with_check_expression
FROM pg_catalog.pg_policy AS p
JOIN pg_catalog.pg_class AS c ON c.oid = p.polrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = ANY (ARRAY[
    'public','afex_core_private','afex_pos_authority',
    'afex_offline_authority','afex_review_private','afex_effect_private'
]::pg_catalog.name[])
ORDER BY n.nspname, c.relname, p.polname;

-- block: READ_ONLY_PREFLIGHT / exact routines, owner, ACL, path, definition hash
SELECT
    n.nspname AS schema_name,
    p.proname,
    pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
    pg_catalog.pg_get_function_result(p.oid) AS result_type,
    owner_role.rolname AS owner,
    p.prokind,
    p.prosecdef,
    p.proleakproof,
    p.provolatile,
    p.proparallel,
    p.proconfig,
    p.proacl,
    pg_catalog.md5(p.prosrc) AS body_md5,
    pg_catalog.pg_get_function_arguments(p.oid) AS display_arguments
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = p.proowner
WHERE n.nspname = ANY (ARRAY['public','afex_core_private','afex_pos_authority','afex_offline_authority','afex_review_private','afex_effect_private']::pg_catalog.name[])
AND p.proname = ANY (ARRAY[
    'acquire_atomic_order_command_result_v1','acquire_atomic_order_command_v1',
    'claim_atomic_order_command_v1','execute_atomic_order_command_v1',
    'replay_atomic_order_command_v1','inspect_atomic_order_reconciliation_v1',
    'place_atomic_order_manual_hold_v1','authorize_atomic_order_retry_v1',
    'resolve_atomic_order_reconciliation_hold_v1','mark_atomic_order_reconciliation_required_v1',
    'issue_pos_actor_session_v1','validate_pos_actor_session_v1',
    'revoke_pos_actor_session_v1','revoke_pos_actor_sessions_for_actor_v1',
    'pos_actor_session_state_v1','cleanup_pos_actor_sessions_v1',
    'lookup_customer_phone_identity_v1','create_customer_with_phone_identity_v1',
    'verify_pos_pin_for_actor','set_pos_pin','hash_pos_pin',
    'create_invoice_with_items_safe','create_invoice_with_items',
    'adjust_inventory_stock','restore_inventory_for_cancelled_invoice',
    'next_branch_monthly_order_number','current_profile_tenant_id',
    'deduct_inventory_on_invoice_item_insert'
]::pg_catalog.name[])
ORDER BY n.nspname, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid);

-- block: READ_ONLY_PREFLIGHT / triggers, view definitions, constraints and indexes
SELECT
    table_schema.nspname AS table_schema,
    table_class.relname AS table_name,
    trigger_row.tgname,
    trigger_schema.nspname AS function_schema,
    trigger_proc.proname AS function_name,
    pg_catalog.pg_get_function_identity_arguments(trigger_proc.oid) AS function_arguments,
    pg_catalog.pg_get_triggerdef(trigger_row.oid, true) AS trigger_definition,
    trigger_row.tgenabled,
    trigger_row.tgisinternal
FROM pg_catalog.pg_trigger AS trigger_row
JOIN pg_catalog.pg_class AS table_class ON table_class.oid = trigger_row.tgrelid
JOIN pg_catalog.pg_namespace AS table_schema ON table_schema.oid = table_class.relnamespace
JOIN pg_catalog.pg_proc AS trigger_proc ON trigger_proc.oid = trigger_row.tgfoid
JOIN pg_catalog.pg_namespace AS trigger_schema ON trigger_schema.oid = trigger_proc.pronamespace
WHERE NOT trigger_row.tgisinternal
AND table_schema.nspname = ANY (ARRAY['public','afex_pos_authority','afex_offline_authority','afex_review_private','afex_effect_private']::pg_catalog.name[])
ORDER BY table_schema.nspname, table_class.relname, trigger_row.tgname;

SELECT
    n.nspname AS schema_name,
    c.relname AS view_name,
    owner_role.rolname AS owner,
    c.reloptions,
    pg_catalog.pg_get_viewdef(c.oid, true) AS view_definition
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = c.relowner
WHERE c.relkind IN ('v','m')
AND n.nspname = ANY (ARRAY['public','afex_core_private','afex_pos_authority','afex_offline_authority','afex_review_private','afex_effect_private']::pg_catalog.name[])
ORDER BY n.nspname, c.relname;

SELECT
    n.nspname AS schema_name,
    c.relname AS table_name,
    con.conname,
    con.contype,
    con.convalidated,
    con.condeferrable,
    con.condeferred,
    pg_catalog.pg_get_constraintdef(con.oid, true) AS definition
FROM pg_catalog.pg_constraint AS con
JOIN pg_catalog.pg_class AS c ON c.oid = con.conrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = ANY (ARRAY['public','afex_core_private','afex_pos_authority','afex_offline_authority','afex_review_private','afex_effect_private']::pg_catalog.name[])
ORDER BY n.nspname, c.relname, con.conname;

SELECT
    n.nspname AS schema_name,
    c.relname AS table_name,
    i.relname AS index_name,
    index_row.indisunique,
    index_row.indisvalid,
    index_row.indisready,
    index_row.indislive,
    pg_catalog.pg_get_indexdef(i.oid) AS index_definition
FROM pg_catalog.pg_index AS index_row
JOIN pg_catalog.pg_class AS i ON i.oid = index_row.indexrelid
JOIN pg_catalog.pg_class AS c ON c.oid = index_row.indrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = ANY (ARRAY['public','afex_core_private','afex_pos_authority','afex_offline_authority','afex_review_private','afex_effect_private']::pg_catalog.name[])
ORDER BY n.nspname, c.relname, i.relname;

-- block: READ_ONLY_PREFLIGHT / dependency edges and required extensions
SELECT
    dependent_schema.nspname AS dependent_schema,
    dependent_class.relname AS dependent_object,
    referenced_schema.nspname AS referenced_schema,
    referenced_class.relname AS referenced_object,
    dependency.deptype
FROM pg_catalog.pg_depend AS dependency
JOIN pg_catalog.pg_class AS dependent_class ON dependent_class.oid = dependency.objid
JOIN pg_catalog.pg_namespace AS dependent_schema ON dependent_schema.oid = dependent_class.relnamespace
JOIN pg_catalog.pg_class AS referenced_class ON referenced_class.oid = dependency.refobjid
JOIN pg_catalog.pg_namespace AS referenced_schema ON referenced_schema.oid = referenced_class.relnamespace
WHERE dependent_schema.nspname = ANY (ARRAY['public','afex_core_private','afex_pos_authority','afex_offline_authority','afex_review_private','afex_effect_private']::pg_catalog.name[])
   OR referenced_schema.nspname = ANY (ARRAY['public','afex_core_private','afex_pos_authority','afex_offline_authority','afex_review_private','afex_effect_private']::pg_catalog.name[])
ORDER BY dependent_schema.nspname, dependent_class.relname, referenced_schema.nspname, referenced_class.relname;

SELECT e.extname, e.extversion, n.nspname AS schema_name
FROM pg_catalog.pg_extension AS e
JOIN pg_catalog.pg_namespace AS n ON n.oid = e.extnamespace
WHERE e.extname = ANY (ARRAY['pgcrypto']::pg_catalog.name[])
ORDER BY e.extname;

-- block: READ_ONLY_PREFLIGHT / locks, invalid indexes and catalog-only drift classification
SELECT
    n.nspname AS schema_name,
    c.relname,
    l.locktype,
    l.mode,
    l.granted,
    l.waitstart IS NOT NULL AS is_waiting,
    a.backend_type
FROM pg_catalog.pg_locks AS l
JOIN pg_catalog.pg_class AS c ON c.oid = l.relation
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
LEFT JOIN pg_catalog.pg_stat_activity AS a ON a.pid = l.pid
WHERE n.nspname = ANY (ARRAY['public','afex_core_private','afex_pos_authority','afex_offline_authority','afex_review_private','afex_effect_private']::pg_catalog.name[])
ORDER BY n.nspname, c.relname, l.granted, l.mode;

WITH frozen(signature, owner_name, security_definer, definition_md5) AS (
    VALUES
    ('public.acquire_atomic_order_command_result_v1(uuid,uuid,uuid,text,text,text,text,timestamp with time zone)','afex_function_owner',true,'eac41a8e26ae11c57f3a9771ee36cd12'),
    ('public.acquire_atomic_order_command_v1(uuid,uuid,uuid,text,text,text,text,timestamp with time zone)','afex_function_owner',true,'4b6889b340a663a36bd79418d8234539'),
    ('public.claim_atomic_order_command_v1(uuid)','afex_function_owner',true,'93d52df465ac66c81f2bacf02de69f00'),
    ('public.execute_atomic_order_command_v1(uuid,uuid)','afex_function_owner',true,'65a8aac3e93d42f2c364e7f28f2f204e'),
    ('public.replay_atomic_order_command_v1(uuid)','afex_function_owner',true,'0e50333d30f089d1515111262662de94'),
    ('public.inspect_atomic_order_reconciliation_v1(uuid)','afex_function_owner',true,'f9636c62781dc5cb2487d9447c66ac7d'),
    ('public.place_atomic_order_manual_hold_v1(uuid,bytea)','afex_function_owner',true,'a673b22b36eb2c88b67a44b2c7297138'),
    ('public.authorize_atomic_order_retry_v1(uuid,uuid,bytea)','afex_function_owner',true,'517397cc440bfb4e4c897cffd69308e6'),
    ('public.resolve_atomic_order_reconciliation_hold_v1(uuid,uuid,bytea,boolean)','afex_function_owner',true,'a50335b2179a18ea7c78fd5bc06fab13'),
    ('public.mark_atomic_order_reconciliation_required_v1(uuid,uuid,bytea)','afex_function_owner',true,'7789bee22be40ac332b7fa0d58e064d7'),
    ('public.issue_pos_actor_session_v1(text,uuid,uuid,text,uuid)','afex_pos_session_owner',true,'cdb42250fa86b95eeca2a5ad93f61b21'),
    ('public.validate_pos_actor_session_v1(text,uuid,uuid)','afex_pos_session_owner',true,'c8dfaa0ab5908d3db2e1bef5c21ead06'),
    ('public.revoke_pos_actor_session_v1(text,uuid,uuid,text)','afex_pos_session_owner',true,'5eee43d08268025e902551e7ae0fdd78'),
    ('public.revoke_pos_actor_sessions_for_actor_v1(uuid,uuid,uuid,text)','afex_pos_session_owner',true,'3c6bfdb387f50a8a4aa173c1ae60dcda'),
    ('public.pos_actor_session_state_v1(uuid,uuid)','afex_pos_session_owner',true,'758e0ac046882fd70f478ae5e1e677e0'),
    ('public.cleanup_pos_actor_sessions_v1(integer)','afex_pos_session_owner',true,'92793bb07e7933385f96c6c5ee175977'),
    ('public.verify_pos_pin_for_actor(text,uuid,uuid)','postgres',true,'8ea4f576c828d8eec29d0683538bb793'),
    ('public.lookup_customer_phone_identity_v1(uuid,text,uuid)','afex_function_owner',true,'01a8f15adebe41129c4d423a9da531c2'),
    ('public.create_customer_with_phone_identity_v1(uuid,uuid,text,text,text,text)','afex_function_owner',true,'d1efb1a835c0fed820c355c5e4366359'),
    ('public.create_invoice_with_items_safe(text,text,text,text,numeric,numeric,text,jsonb,text,uuid,uuid,uuid)','postgres',true,'f62e3582f536265f1b686014f8ab5fdf'),
    ('public.adjust_inventory_stock(uuid,uuid,uuid,numeric,text,text,uuid)','postgres',true,'1f84f704084935f26352488a7ffae105'),
    ('public.restore_inventory_for_cancelled_invoice(uuid,uuid)','postgres',true,'71ca89c7e85e976071f4ae8a3aae96c8'),
    ('public.next_branch_monthly_order_number(uuid,uuid,timestamp with time zone)','postgres',true,'89cddfc7d84aa928ef80b3cc2add6cef')
), actual AS (
    SELECT
        pg_catalog.format(
            '%I.%I(%s)',
            n.nspname,
            p.proname,
            pg_catalog.replace(pg_catalog.pg_get_function_identity_arguments(p.oid), ', ', ',')
        ) AS signature,
        owner_role.rolname AS owner_name,
        p.prosecdef AS security_definer,
        pg_catalog.md5(p.prosrc) AS definition_md5
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = p.proowner
    WHERE n.nspname = 'public'
)
SELECT
    frozen.signature,
    CASE
        WHEN actual.signature IS NULL THEN 'BLOCKED_MISSING_OBJECT'
        WHEN actual.owner_name <> frozen.owner_name THEN 'BLOCKED_OWNER_DRIFT'
        WHEN actual.security_definer <> frozen.security_definer THEN 'BLOCKED_MODE_DRIFT'
        WHEN actual.definition_md5 <> frozen.definition_md5 THEN 'BLOCKED_BODY_HASH_DRIFT'
        ELSE 'MATCH'
    END AS identity_classification,
    actual.owner_name,
    actual.security_definer,
    actual.definition_md5
FROM frozen
LEFT JOIN actual USING (signature)
ORDER BY frozen.signature;

ROLLBACK;
