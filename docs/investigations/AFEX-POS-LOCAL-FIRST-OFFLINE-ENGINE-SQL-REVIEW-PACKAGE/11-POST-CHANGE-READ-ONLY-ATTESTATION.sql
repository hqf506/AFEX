/*
classification: READ_ONLY_PREFLIGHT
wave: 8
purpose: Prove exact post-change roles, ownership, ACL/RLS, routine, trigger, view, constraint, index and invariant state without reading business payloads.
execution status: NOT AUTHORIZED
prerequisites: Independently approved application/SQL package executed by the future human operator on a non-Production qualification target.
expected owner/operator: Read-only catalog investigator independent from the migration operator.
transaction behavior: One explicit READ ONLY transaction ending in ROLLBACK.
lock risk: Catalog/relation ACCESS SHARE only.
retry behavior: Stop on any mismatch; never reinterpret a failure as an acceptable drift.
rollback reference: SQL-REVIEW-ROLLBACK-CONTRACT.md; attestation itself changes nothing.
required evidence before execution: Per-wave manifests, operator transcript, exact target identity and expected object manifest.
*/

-- block: READ_ONLY_PREFLIGHT / post-change role and membership closure
BEGIN TRANSACTION READ ONLY;

SELECT
    r.rolname,
    r.rolcanlogin,
    r.rolsuper,
    r.rolinherit,
    r.rolcreatedb,
    r.rolcreaterole,
    r.rolreplication,
    r.rolbypassrls,
    CASE
        WHEN r.rolname = ANY (ARRAY[
            'afex_identity_owner','afex_business_owner','afex_inventory_owner','afex_audit_owner',
            'afex_offline_authority_owner','afex_review_owner','afex_effect_owner',
            'afex_offline_enrollment_runtime','afex_offline_acquisition_runtime',
            'afex_business_review_runtime','afex_effect_dispatcher','afex_inventory_admin_runtime'
        ]::pg_catalog.name[])
         AND NOT r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolinherit
         AND NOT r.rolcreatedb AND NOT r.rolcreaterole
         AND NOT r.rolreplication AND NOT r.rolbypassrls
        THEN 'MATCH_PROPOSED_ROLE'
        WHEN r.rolname = ANY (ARRAY[
            'afex_core_owner','afex_function_owner','afex_pos_session_owner',
            'afex_core_runtime','afex_pos_session_maintenance','afex_reconciliation_authority'
        ]::pg_catalog.name[])
         AND NOT r.rolcanlogin AND NOT r.rolsuper
         AND NOT r.rolcreatedb AND NOT r.rolcreaterole
         AND NOT r.rolreplication AND NOT r.rolbypassrls
        THEN 'MATCH_PROVEN_EXISTING_ATTRIBUTES_ROLINHERIT_INFORMATIONAL'
        ELSE 'REVIEW'
    END AS attribute_classification
FROM pg_catalog.pg_roles AS r
WHERE r.rolname LIKE 'afex\_%' ESCAPE '\'
ORDER BY r.rolname;

SELECT pg_catalog.count(*) AS forbidden_browser_or_gateway_memberships
FROM pg_catalog.pg_auth_members AS m
JOIN pg_catalog.pg_roles AS member_role ON member_role.oid = m.member
JOIN pg_catalog.pg_roles AS granted_role ON granted_role.oid = m.roleid
WHERE member_role.rolname = ANY (ARRAY['anon','authenticated','service_role']::pg_catalog.name[])
AND granted_role.rolname LIKE 'afex\_%' ESCAPE '\';

-- block: READ_ONLY_PREFLIGHT / post-change schema, relation, ACL and RLS identity
SELECT
    n.nspname,
    owner_role.rolname AS owner,
    n.nspacl
FROM pg_catalog.pg_namespace AS n
JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = n.nspowner
WHERE n.nspname = ANY (ARRAY[
    'public','afex_core_private','afex_pos_authority',
    'afex_offline_authority','afex_review_private','afex_effect_private'
]::pg_catalog.name[])
ORDER BY n.nspname;

SELECT
    n.nspname AS schema_name,
    c.relname,
    c.relkind,
    owner_role.rolname AS owner,
    c.relrowsecurity,
    c.relforcerowsecurity,
    c.relacl
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = c.relowner
WHERE n.nspname = ANY (ARRAY[
    'public','afex_core_private','afex_pos_authority',
    'afex_offline_authority','afex_review_private','afex_effect_private'
]::pg_catalog.name[])
ORDER BY n.nspname, c.relname;

SELECT
    role_row.rolname,
    n.nspname AS schema_name,
    c.relname,
    EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))) AS public_acl
        WHERE public_acl.grantee = 0
    ) AS public_has_object_privilege,
    pg_catalog.has_table_privilege(role_row.oid, c.oid, 'SELECT') AS can_select_table,
    pg_catalog.has_table_privilege(role_row.oid, c.oid, 'INSERT') AS can_insert,
    pg_catalog.has_table_privilege(role_row.oid, c.oid, 'UPDATE') AS can_update,
    pg_catalog.has_table_privilege(role_row.oid, c.oid, 'DELETE') AS can_delete
FROM pg_catalog.pg_roles AS role_row
CROSS JOIN pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE role_row.rolname = ANY (ARRAY['anon','authenticated','service_role']::pg_catalog.name[])
AND n.nspname = ANY (ARRAY['public','afex_core_private','afex_pos_authority','afex_offline_authority','afex_review_private','afex_effect_private']::pg_catalog.name[])
AND c.relname = ANY (ARRAY[
    'profiles','customers','orders','invoices','invoice_items','order_status_logs',
    'pos_profiles','inventory_stock','inventory_movements','inventory_movements_view',
    'audit_logs','branch_whatsapp_configs','order_number_sequences',
    'offline_devices','offline_employee_authorities','offline_key_envelopes',
    'offline_command_bindings','atomic_business_reviews','atomic_payment_attestations',
    'branch_inventory_snapshot_headers','branch_inventory_snapshot_items','atomic_effect_ledger'
]::pg_catalog.name[])
ORDER BY role_row.rolname, n.nspname, c.relname;

-- block: READ_ONLY_PREFLIGHT / post-change exact policies and default privileges
SELECT
    n.nspname AS schema_name,
    c.relname AS table_name,
    p.polname,
    p.polpermissive,
    p.polcmd,
    pg_catalog.pg_get_expr(p.polqual, p.polrelid) AS using_expression,
    pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid) AS with_check_expression
FROM pg_catalog.pg_policy AS p
JOIN pg_catalog.pg_class AS c ON c.oid = p.polrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = ANY (ARRAY['public','afex_core_private','afex_pos_authority','afex_offline_authority','afex_review_private','afex_effect_private']::pg_catalog.name[])
ORDER BY n.nspname, c.relname, p.polname;

SELECT
    owner_role.rolname AS owner,
    n.nspname AS schema_name,
    d.defaclobjtype,
    d.defaclacl
FROM pg_catalog.pg_default_acl AS d
JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = d.defaclrole
LEFT JOIN pg_catalog.pg_namespace AS n ON n.oid = d.defaclnamespace
WHERE n.nspname = ANY (ARRAY['public','afex_core_private','afex_pos_authority','afex_offline_authority','afex_review_private','afex_effect_private']::pg_catalog.name[])
   OR owner_role.rolname LIKE 'afex\_%' ESCAPE '\'
ORDER BY owner_role.rolname, n.nspname NULLS FIRST, d.defaclobjtype;

-- block: READ_ONLY_PREFLIGHT / post-change routines, PUBLIC inheritance and overloads
SELECT
    n.nspname AS schema_name,
    p.proname,
    pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
    pg_catalog.pg_get_function_result(p.oid) AS result_type,
    owner_role.rolname AS owner,
    p.prosecdef,
    p.proconfig,
    p.proacl,
    pg_catalog.md5(p.prosrc) AS body_md5,
    EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) AS public_acl
        WHERE public_acl.grantee = 0 AND public_acl.privilege_type = 'EXECUTE'
    ) AS public_can_execute,
    pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
    pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
    pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_can_execute
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = p.proowner
WHERE n.nspname = ANY (ARRAY['public','afex_core_private','afex_pos_authority','afex_offline_authority','afex_review_private','afex_effect_private']::pg_catalog.name[])
AND (
    p.proname LIKE 'afex\_%' ESCAPE '\'
    OR p.proname LIKE '%offline%' OR p.proname LIKE '%atomic%'
    OR p.proname = ANY (ARRAY[
        'lookup_customer_phone_identity_v1','create_customer_with_phone_identity_v1',
        'verify_pos_pin_for_actor','set_pos_pin','hash_pos_pin',
        'create_invoice_with_items_safe','create_invoice_with_items',
        'adjust_inventory_stock','restore_inventory_for_cancelled_invoice',
        'next_branch_monthly_order_number','deduct_inventory_on_invoice_item_insert'
    ]::pg_catalog.name[])
)
ORDER BY n.nspname, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid);

-- block: READ_ONLY_PREFLIGHT / post-change triggers, views, constraints and indexes
SELECT
    n.nspname AS schema_name,
    c.relname AS table_name,
    t.tgname,
    t.tgenabled,
    pg_catalog.pg_get_triggerdef(t.oid, true) AS trigger_definition
FROM pg_catalog.pg_trigger AS t
JOIN pg_catalog.pg_class AS c ON c.oid = t.tgrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE NOT t.tgisinternal
AND n.nspname = ANY (ARRAY['public','afex_core_private','afex_pos_authority','afex_offline_authority','afex_review_private','afex_effect_private']::pg_catalog.name[])
ORDER BY n.nspname, c.relname, t.tgname;

SELECT
    n.nspname AS schema_name,
    c.relname AS view_name,
    c.reloptions,
    pg_catalog.pg_get_viewdef(c.oid, true) AS definition
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE c.relkind IN ('v','m')
AND n.nspname = ANY (ARRAY['public','afex_core_private','afex_pos_authority','afex_offline_authority','afex_review_private','afex_effect_private']::pg_catalog.name[])
ORDER BY n.nspname, c.relname;

SELECT
    n.nspname AS schema_name,
    c.relname AS table_name,
    con.conname,
    con.contype,
    con.convalidated,
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
    pg_catalog.pg_get_indexdef(i.oid) AS definition
FROM pg_catalog.pg_index AS index_row
JOIN pg_catalog.pg_class AS i ON i.oid = index_row.indexrelid
JOIN pg_catalog.pg_class AS c ON c.oid = index_row.indrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = ANY (ARRAY['public','afex_core_private','afex_pos_authority','afex_offline_authority','afex_review_private','afex_effect_private']::pg_catalog.name[])
ORDER BY n.nspname, c.relname, i.relname;

-- block: READ_ONLY_PREFLIGHT / post-change invariant violation counts only, no identifiers or payloads
SELECT 'dual_active_device' AS invariant, pg_catalog.count(*) AS violation_groups
FROM (
    SELECT d.tenant_id, d.branch_id
    FROM afex_offline_authority.offline_devices AS d
    WHERE d.status = 'active'
    GROUP BY d.tenant_id, d.branch_id
    HAVING pg_catalog.count(*) > 1
) AS violations
UNION ALL
SELECT 'active_employee_roster_over_25', pg_catalog.count(*)
FROM (
    SELECT a.device_id
    FROM afex_offline_authority.offline_employee_authorities AS a
    WHERE a.status = 'active'
    GROUP BY a.device_id
    HAVING pg_catalog.count(*) > 25
) AS violations
UNION ALL
SELECT 'duplicate_device_local_command', pg_catalog.count(*)
FROM (
    SELECT b.device_id, b.local_command_id
    FROM afex_core_private.offline_command_bindings AS b
    GROUP BY b.device_id, b.local_command_id
    HAVING pg_catalog.count(*) > 1
) AS violations
UNION ALL
SELECT 'duplicate_device_local_sequence', pg_catalog.count(*)
FROM (
    SELECT b.device_id, b.local_sequence
    FROM afex_core_private.offline_command_bindings AS b
    GROUP BY b.device_id, b.local_sequence
    HAVING pg_catalog.count(*) > 1
) AS violations
UNION ALL
SELECT 'duplicate_effect_identity', pg_catalog.count(*)
FROM (
    SELECT e.server_command_id, e.effect_type, e.effect_version
    FROM afex_effect_private.atomic_effect_ledger AS e
    GROUP BY e.server_command_id, e.effect_type, e.effect_version
    HAVING pg_catalog.count(*) > 1
) AS violations;

ROLLBACK;
