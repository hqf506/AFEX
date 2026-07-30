\if :{?AFEX_EXPECTED_DATABASE}
\else
\echo 'P2D.21 failed: AFEX_EXPECTED_DATABASE is required'
\quit 3
\endif
\if :{?AFEX_EXPECTED_USER}
\else
\echo 'P2D.21 failed: AFEX_EXPECTED_USER is required'
\quit 3
\endif

SELECT
    pg_catalog.current_database() = :'AFEX_EXPECTED_DATABASE'
        AS p2d21_database_matches,
    CURRENT_USER::text = :'AFEX_EXPECTED_USER'
        AS p2d21_user_matches
\gset

\if :p2d21_database_matches
\else
\echo 'P2D.21 failed: database identity mismatch'
\quit 3
\endif
\if :p2d21_user_matches
\else
\echo 'P2D.21 failed: installer identity mismatch'
\quit 3
\endif

BEGIN TRANSACTION READ ONLY;

-- AFEX Core V2 P2D.21 - Manual Production Preflight
-- READ ONLY. This artifact performs no installation or repair.

DO $preflight$
BEGIN
    IF pg_catalog.current_setting('server_version_num')::integer <> 170006 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.21 failed: exact PostgreSQL 17.6 (170006) is required';
    END IF;

    IF pg_catalog.current_setting('server_encoding') IS DISTINCT FROM 'UTF8' THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.21 failed: server_encoding must be UTF8';
    END IF;

    IF pg_catalog.current_setting('transaction_read_only') IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION USING
            errcode = '25006',
            message = 'P2D.21 failed: transaction is not read only';
    END IF;

    IF CURRENT_USER IS NULL
       OR SESSION_USER IS NULL
       OR pg_catalog.current_database() IS NULL THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.21 failed: database or session identity is unavailable';
    END IF;

    RAISE NOTICE 'P2D21_100_ENVIRONMENT_IDENTITY_OK';
END
$preflight$;

DO $preflight$
DECLARE
    target_role_oids oid[];
    installation_role_oid oid;
    automatic_grantor_oid oid;
    automatic_grantor_count integer;
BEGIN
    SELECT pg_catalog.array_agg(role_state.oid ORDER BY role_state.rolname)
    INTO target_role_oids
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname = ANY (ARRAY[
        'afex_core_owner',
        'afex_core_runtime',
        'afex_context_issuer',
        'afex_outbox_worker',
        'afex_function_owner'
    ]::text[]);

    IF pg_catalog.cardinality(target_role_oids) <> 5
       OR EXISTS (
           SELECT 1
           FROM pg_catalog.pg_authid AS role_state
           WHERE role_state.oid = ANY (target_role_oids)
             AND (
                 role_state.rolcanlogin
                 OR role_state.rolinherit
                 OR role_state.rolsuper
                 OR role_state.rolcreatedb
                 OR role_state.rolcreaterole
                 OR role_state.rolreplication
                 OR role_state.rolbypassrls
                 OR role_state.rolpassword IS NOT NULL
             )
       )
       OR EXISTS (
           SELECT 1
           FROM unnest(target_role_oids) AS target_role(role_oid)
           WHERE (
               SELECT pg_catalog.count(*)
               FROM pg_catalog.pg_db_role_setting AS setting_state
               WHERE setting_state.setrole = target_role.role_oid
                 AND setting_state.setdatabase = 0
                 AND setting_state.setconfig =
                     ARRAY['search_path=pg_catalog, public']::text[]
           ) <> 1
              OR EXISTS (
                  SELECT 1
                  FROM pg_catalog.pg_db_role_setting AS setting_state
                  WHERE setting_state.setrole = target_role.role_oid
                    AND setting_state.setdatabase <> 0
              )
       ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.21 failed: P2D.15 role attribute or configuration mismatch';
    END IF;

    SELECT role_state.oid
    INTO installation_role_oid
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname = CURRENT_USER;

    SELECT
        (pg_catalog.array_agg(
            DISTINCT membership.grantor
            ORDER BY membership.grantor
        ))[1],
        pg_catalog.count(DISTINCT membership.grantor)
    INTO automatic_grantor_oid, automatic_grantor_count
    FROM pg_catalog.pg_auth_members AS membership
    WHERE membership.roleid = ANY (target_role_oids)
      AND membership.member = installation_role_oid
      AND membership.grantor <> installation_role_oid
      AND membership.admin_option
      AND NOT membership.inherit_option
      AND NOT membership.set_option;

    IF installation_role_oid IS NULL
       OR automatic_grantor_oid IS NULL
       OR automatic_grantor_oid IS DISTINCT FROM (
           SELECT role_state.oid
           FROM pg_catalog.pg_roles AS role_state
           WHERE role_state.rolname = 'supabase_admin'
       )
       OR automatic_grantor_count <> 1
       OR (
           SELECT pg_catalog.count(*)
           FROM pg_catalog.pg_auth_members AS membership
           WHERE membership.roleid = ANY (target_role_oids)
              OR membership.member = ANY (target_role_oids)
       ) <> 5
       OR (
           SELECT pg_catalog.count(*)
           FROM pg_catalog.pg_auth_members AS membership
           WHERE membership.roleid = ANY (target_role_oids)
             AND membership.member = installation_role_oid
             AND membership.grantor = automatic_grantor_oid
             AND membership.admin_option
             AND NOT membership.inherit_option
             AND NOT membership.set_option
       ) <> 5
       OR EXISTS (
           SELECT 1
           FROM pg_catalog.pg_auth_members AS membership
           WHERE membership.member = ANY (target_role_oids)
              OR (
                  membership.roleid = ANY (target_role_oids)
                  AND (
                      membership.member <> installation_role_oid
                      OR membership.grantor <> automatic_grantor_oid
                      OR NOT membership.admin_option
                      OR membership.inherit_option
                      OR membership.set_option
                  )
              )
       ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.21 failed: P2D.15 role membership contract mismatch';
    END IF;

    RAISE NOTICE 'P2D21_200_ROLE_CONTRACT_OK';
END
$preflight$;

DO $preflight$
DECLARE
    core_owner_oid oid;
    function_owner_oid oid;
    target_relation record;
    actual_privileges text[];
BEGIN
    SELECT role_state.oid
    INTO core_owner_oid
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname = 'afex_core_owner';

    SELECT role_state.oid
    INTO function_owner_oid
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname = 'afex_function_owner';

    FOR target_relation IN
        SELECT
            expected.table_name,
            expected.policy_name,
            relation_state.oid AS relation_oid,
            relation_state.relacl
        FROM (
            VALUES
                (
                    'atomic_authorization_contexts',
                    'atomic_authorization_contexts_function_owner_all'
                ),
                (
                    'atomic_order_commands',
                    'atomic_order_commands_function_owner_all'
                )
        ) AS expected(table_name, policy_name)
        JOIN pg_catalog.pg_class AS relation_state
          ON relation_state.oid =
             pg_catalog.to_regclass('public.' || expected.table_name)
        WHERE relation_state.relkind = 'r'
          AND relation_state.relowner = core_owner_oid
          AND relation_state.relrowsecurity
          AND relation_state.relforcerowsecurity
    LOOP
        IF (
            SELECT pg_catalog.count(*)
            FROM pg_catalog.pg_policy AS policy_state
            WHERE policy_state.polrelid = target_relation.relation_oid
              AND policy_state.polname = target_relation.policy_name
              AND policy_state.polcmd = '*'
              AND policy_state.polpermissive
              AND policy_state.polroles =
                  ARRAY[function_owner_oid]::oid[]
              AND pg_catalog.pg_get_expr(
                      policy_state.polqual,
                      policy_state.polrelid
                  ) = 'true'
              AND pg_catalog.pg_get_expr(
                      policy_state.polwithcheck,
                      policy_state.polrelid
                  ) = 'true'
        ) <> 1 OR (
            SELECT pg_catalog.count(*)
            FROM pg_catalog.pg_policy AS policy_state
            WHERE policy_state.polrelid = target_relation.relation_oid
        ) <> 1 THEN
            RAISE EXCEPTION USING
                errcode = '55000',
                message = 'P2D.21 failed: Foundation policy contract mismatch',
                detail = 'public.' || target_relation.table_name;
        END IF;

        IF target_relation.relacl IS NOT NULL
           AND (CASE
               WHEN pg_catalog.cardinality(target_relation.relacl) > 0
                    AND pg_catalog.array_ndims(target_relation.relacl)
                        IS DISTINCT FROM 1
                   THEN true
               WHEN pg_catalog.array_ndims(target_relation.relacl) = 1
                   THEN pg_catalog.array_position(
                       target_relation.relacl,
                       NULL::aclitem
                   ) IS NOT NULL
               ELSE false
           END) THEN
            RAISE EXCEPTION USING
                errcode = '55000',
                message = 'P2D.21 failed: malformed Foundation table ACL array',
                detail = 'public.' || target_relation.table_name;
        END IF;

        SELECT pg_catalog.array_agg(
            acl_state.privilege_type
            ORDER BY acl_state.privilege_type
        )
        INTO actual_privileges
        FROM pg_catalog.unnest(target_relation.relacl) AS acl_item(value)
        CROSS JOIN LATERAL pg_catalog.aclexplode(
            ARRAY[acl_item.value]::aclitem[]
        ) AS acl_state
        WHERE acl_state.grantee = function_owner_oid
          AND acl_state.grantor = core_owner_oid
          AND NOT acl_state.is_grantable;

        IF actual_privileges IS DISTINCT FROM
           ARRAY['INSERT', 'SELECT', 'UPDATE']::text[]
           OR EXISTS (
               SELECT 1
               FROM pg_catalog.unnest(target_relation.relacl) AS acl_item(value)
               CROSS JOIN LATERAL pg_catalog.aclexplode(
                   ARRAY[acl_item.value]::aclitem[]
               ) AS acl_state
               WHERE acl_state.grantee NOT IN (
                   core_owner_oid,
                   function_owner_oid
               )
                  OR (
                      acl_state.grantee = function_owner_oid
                      AND (
                          acl_state.grantor <> core_owner_oid
                          OR acl_state.is_grantable
                          OR acl_state.privilege_type NOT IN (
                              'SELECT',
                              'INSERT',
                              'UPDATE'
                          )
                      )
                  )
           ) THEN
            RAISE EXCEPTION USING
                errcode = '55000',
                message = 'P2D.21 failed: Foundation ACL contract mismatch',
                detail = 'public.' || target_relation.table_name;
        END IF;
    END LOOP;

    IF (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_class AS relation_state
        WHERE relation_state.oid IN (
            pg_catalog.to_regclass(
                'public.atomic_authorization_contexts'
            ),
            pg_catalog.to_regclass('public.atomic_order_commands')
        )
          AND relation_state.relkind = 'r'
          AND relation_state.relowner = core_owner_oid
          AND relation_state.relrowsecurity
          AND relation_state.relforcerowsecurity
    ) <> 2
       OR EXISTS (
           SELECT 1
           FROM pg_catalog.pg_policy AS policy_state
           WHERE policy_state.polname IN (
               'atomic_authorization_contexts_owner_all',
               'atomic_order_commands_owner_all'
           )
       )
       OR EXISTS (
           SELECT 1 FROM public.atomic_order_commands
       ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.21 failed: Foundation state or bootstrap residue mismatch';
    END IF;

    RAISE NOTICE 'P2D21_300_FOUNDATION_SECURITY_OK';
END
$preflight$;

DO $preflight$
DECLARE
    required_column record;
    function_owner_oid oid;
BEGIN
    IF pg_catalog.to_regclass(
           'public.atomic_order_command_payloads'
       ) IS NOT NULL
       OR pg_catalog.to_regprocedure(
           'public.acquire_atomic_order_command_v1(uuid,uuid,uuid,text,text,text,text,timestamp with time zone)'
       ) IS NOT NULL
       OR pg_catalog.to_regprocedure(
           'public.canonicalize_atomic_order_json_v1(jsonb)'
       ) IS NOT NULL
       OR EXISTS (
           SELECT 1
           FROM pg_catalog.pg_proc AS procedure_state
           JOIN pg_catalog.pg_namespace AS namespace_state
             ON namespace_state.oid = procedure_state.pronamespace
           WHERE namespace_state.nspname = 'public'
             AND procedure_state.proname IN (
                 'acquire_atomic_order_command_v1',
                 'canonicalize_atomic_order_json_v1'
             )
       )
       OR EXISTS (
           SELECT 1
           FROM pg_catalog.pg_constraint AS constraint_state
           WHERE constraint_state.conname =
                 'atomic_order_command_payloads_canonical_size_binding_check'
       ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.21 failed: partial P2D.19/P2D.20 installation residue exists';
    END IF;

    FOR required_column IN
        SELECT *
        FROM (
            VALUES
                ('profiles', 'id', 'uuid', true),
                ('profiles', 'tenant_id', 'uuid', false),
                ('profiles', 'branch_id', 'uuid', false),
                ('profiles', 'role', 'text', true),
                ('profiles', 'is_active', 'boolean', true),
                (
                    'profiles',
                    'updated_at',
                    'timestamp with time zone',
                    true
                ),
                ('tenants', 'id', 'uuid', true),
                ('branches', 'id', 'uuid', true),
                ('branches', 'tenant_id', 'uuid', false),
                ('branches', 'is_active', 'boolean', true),
                (
                    'branches',
                    'deleted_at',
                    'timestamp with time zone',
                    false
                )
        ) AS expected(
            table_name,
            column_name,
            formatted_type,
            not_null
        )
    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM pg_catalog.pg_attribute AS attribute_state
            WHERE attribute_state.attrelid =
                  pg_catalog.to_regclass(
                      'public.' || required_column.table_name
                  )
              AND attribute_state.attname =
                  required_column.column_name
              AND pg_catalog.format_type(
                      attribute_state.atttypid,
                      attribute_state.atttypmod
                  ) = required_column.formatted_type
              AND attribute_state.attnotnull =
                  required_column.not_null
              AND attribute_state.attnum > 0
              AND NOT attribute_state.attisdropped
        ) THEN
            RAISE EXCEPTION USING
                errcode = '55000',
                message = 'P2D.21 failed: authorization-evidence column contract mismatch',
                detail = required_column.table_name || '.' ||
                         required_column.column_name;
        END IF;
    END LOOP;

    SELECT role_state.oid
    INTO function_owner_oid
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname = 'afex_function_owner';

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute AS attribute_state
        WHERE attribute_state.attrelid IN (
            pg_catalog.to_regclass('public.profiles'),
            pg_catalog.to_regclass('public.pos_profiles'),
            pg_catalog.to_regclass('public.branches')
        )
          AND attribute_state.attnum > 0
          AND NOT attribute_state.attisdropped
          AND attribute_state.attacl IS NOT NULL
          AND (CASE
              WHEN pg_catalog.cardinality(attribute_state.attacl) > 0
                   AND pg_catalog.array_ndims(attribute_state.attacl)
                       IS DISTINCT FROM 1
                  THEN true
              WHEN pg_catalog.array_ndims(attribute_state.attacl) = 1
                  THEN pg_catalog.array_position(
                      attribute_state.attacl,
                      NULL::aclitem
                  ) IS NOT NULL
              ELSE false
          END)
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.21 failed: malformed authorization-evidence column ACL array';
    END IF;

    IF function_owner_oid IS NULL
       OR EXISTS (
           SELECT 1
           FROM pg_catalog.pg_policy AS policy_state
           WHERE (
               policy_state.polrelid =
                   pg_catalog.to_regclass('public.profiles')
               AND policy_state.polname =
                   'core_v2_function_owner_profiles_authorization_read'
           )
           OR (
               policy_state.polrelid =
                   pg_catalog.to_regclass('public.tenants')
               AND policy_state.polname =
                   'core_v2_function_owner_tenants_authorization_read'
           )
           OR (
               policy_state.polrelid =
                   pg_catalog.to_regclass('public.branches')
               AND policy_state.polname =
                   'core_v2_function_owner_branches_authorization_read'
           )
       )
       OR pg_catalog.has_table_privilege(
           'afex_function_owner',
           'public.profiles',
           'SELECT'
       )
       OR pg_catalog.has_table_privilege(
           'afex_function_owner',
           'public.tenants',
           'SELECT'
       )
       OR pg_catalog.has_table_privilege(
           'afex_function_owner',
           'public.branches',
           'SELECT'
       )
       OR EXISTS (
           SELECT 1
           FROM pg_catalog.pg_attribute AS attribute_state
           CROSS JOIN LATERAL pg_catalog.unnest(
               attribute_state.attacl
           ) AS acl_item(value)
           CROSS JOIN LATERAL pg_catalog.aclexplode(
               ARRAY[acl_item.value]::aclitem[]
           ) AS acl_state
           WHERE attribute_state.attrelid IN (
               pg_catalog.to_regclass('public.profiles'),
               pg_catalog.to_regclass('public.tenants'),
               pg_catalog.to_regclass('public.branches')
           )
             AND attribute_state.attnum > 0
             AND NOT attribute_state.attisdropped
             AND acl_state.grantee = function_owner_oid
       ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.21 failed: P2D.20 policy or ACL conflict exists';
    END IF;

    RAISE NOTICE 'P2D21_400_AUTHORIZATION_EVIDENCE_CONTRACT_OK';
END
$preflight$;

DO $preflight$
DECLARE
    relation_authority record;
BEGIN
    IF CURRENT_USER IS DISTINCT FROM 'postgres'
       OR SESSION_USER IS DISTINCT FROM 'postgres'
       OR NOT EXISTS (
           SELECT 1
           FROM pg_catalog.pg_roles AS role_state
           WHERE role_state.rolname = CURRENT_USER
             AND role_state.rolcanlogin
             AND role_state.rolcreaterole
       )
       OR NOT pg_catalog.has_schema_privilege(
        CURRENT_USER,
        'public',
        'CREATE'
    )
       OR NOT pg_catalog.has_schema_privilege(
           CURRENT_USER,
           'public',
           'USAGE'
       )
       OR NOT pg_catalog.has_schema_privilege(
           CURRENT_USER,
           'public',
           'CREATE WITH GRANT OPTION'
       )
       OR pg_catalog.pg_has_role(
           CURRENT_USER,
           'afex_core_owner',
           'SET'
       )
       OR pg_catalog.pg_has_role(
           CURRENT_USER,
           'afex_function_owner',
           'SET'
       )
       OR pg_catalog.has_schema_privilege(
           'afex_core_owner',
           'public',
           'CREATE'
       )
       OR pg_catalog.has_schema_privilege(
           'afex_function_owner',
           'public',
           'CREATE'
       )
       OR EXISTS (
           SELECT 1
           FROM pg_catalog.pg_namespace AS namespace_state
           JOIN pg_catalog.pg_roles AS target_role
             ON target_role.rolname IN (
                 'afex_core_owner',
                 'afex_function_owner'
             )
           CROSS JOIN LATERAL pg_catalog.unnest(
               namespace_state.nspacl
           ) AS acl_item(value)
           CROSS JOIN LATERAL pg_catalog.aclexplode(
               ARRAY[acl_item.value]::aclitem[]
           ) AS acl_state
           WHERE namespace_state.nspname = 'public'
             AND acl_state.grantee = target_role.oid
       ) THEN
        RAISE EXCEPTION USING
            errcode = '42501',
            message = 'P2D.21 failed: transactional bootstrap authority is insufficient';
    END IF;

    FOR relation_authority IN
        SELECT
            namespace_state.nspname || '.' ||
                relation_state.relname AS relation_name,
            relation_state.relowner AS owner_oid
        FROM pg_catalog.pg_class AS relation_state
        JOIN pg_catalog.pg_namespace AS namespace_state
          ON namespace_state.oid = relation_state.relnamespace
        WHERE relation_state.oid IN (
            pg_catalog.to_regclass('public.profiles'),
            pg_catalog.to_regclass('public.tenants'),
            pg_catalog.to_regclass('public.branches')
        )
    LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM pg_catalog.pg_roles AS installer_role
            WHERE installer_role.rolname = CURRENT_USER
              AND (
                  installer_role.rolsuper
                   OR pg_catalog.pg_has_role(
                       CURRENT_USER,
                       relation_authority.owner_oid,
                       'SET'
                   )
              )
        ) THEN
            RAISE EXCEPTION USING
                errcode = '42501',
                message = 'P2D.21 failed: installer lacks authorization-relation owner authority',
                detail = relation_authority.relation_name;
        END IF;
    END LOOP;

    RAISE NOTICE 'P2D21_500_INSTALLER_AUTHORITY_OK';
END
$preflight$;

DO $preflight$
BEGIN
    IF pg_catalog.to_regprocedure('gen_random_uuid()') IS NULL
       OR pg_catalog.to_regprocedure('digest(bytea,text)') IS NULL
       OR pg_catalog.to_regprocedure('sha256(bytea)') IS NULL
       OR normalize('AFEX', NFC) IS DISTINCT FROM 'AFEX'
       OR NOT (
           '{"one":1}' IS JSON OBJECT WITH UNIQUE KEYS
       )
       OR (
           '{"duplicate":1,"duplicate":2}'
               IS JSON OBJECT WITH UNIQUE KEYS
       ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.21 failed: required PostgreSQL feature contract mismatch';
    END IF;

    RAISE NOTICE 'P2D21_600_POSTGRESQL_FEATURES_OK';
END
$preflight$;

SELECT
    CURRENT_USER AS current_user,
    SESSION_USER AS session_user,
    pg_catalog.current_database() AS database_name,
    pg_catalog.current_setting('server_version') AS server_version,
    pg_catalog.current_setting('server_version_num') AS server_version_num,
    pg_catalog.current_setting('server_encoding') AS server_encoding,
    pg_catalog.current_setting('transaction_read_only')
        AS transaction_read_only;

SELECT
    role_state.rolname AS role_name,
    role_state.rolcanlogin,
    role_state.rolinherit,
    role_state.rolsuper,
    role_state.rolcreatedb,
    role_state.rolcreaterole,
    role_state.rolreplication,
    role_state.rolbypassrls,
    role_state.rolpassword IS NULL AS password_is_null
FROM pg_catalog.pg_authid AS role_state
WHERE role_state.rolname = ANY (ARRAY[
    'afex_core_owner',
    'afex_core_runtime',
    'afex_context_issuer',
    'afex_outbox_worker',
    'afex_function_owner'
]::text[])
ORDER BY role_state.rolname;

DO $preflight$
BEGIN
    RAISE NOTICE 'P2D21_900_MANUAL_PRODUCTION_PREFLIGHT_OK';
END
$preflight$;

SELECT
    'PASS'::text AS preflight_result,
    'P2D21_900_MANUAL_PRODUCTION_PREFLIGHT_OK'::text
        AS final_marker;

ROLLBACK;
