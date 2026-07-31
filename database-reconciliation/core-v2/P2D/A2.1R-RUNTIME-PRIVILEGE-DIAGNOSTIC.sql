\set ON_ERROR_STOP on

\if :{?AFEX_TARGET_LOGIN}
\else
\set AFEX_TARGET_LOGIN ''
\endif

-- AFEX Core V2 A2.1R — Runtime Privilege Diagnostic
-- Restricted operational evidence. Catalog metadata only.
-- Read-only: no role change, business function call, DDL, DML, or repair.

BEGIN TRANSACTION READ ONLY;

-- 010 — Server/session identity
SELECT 'A21R_SECTION_010_SERVER_SESSION_IDENTITY'::text AS section;

SELECT
    pg_catalog.current_database()::text AS database_name,
    CURRENT_USER::text AS current_user_name,
    SESSION_USER::text AS session_user_name,
    pg_catalog.current_setting('server_version')::text AS server_version,
    pg_catalog.current_setting('server_version_num')::integer AS server_version_num,
    pg_catalog.current_setting('server_encoding')::text AS server_encoding,
    pg_catalog.current_setting('transaction_read_only')::text AS transaction_read_only,
    pg_catalog.current_setting('role', true)::text AS current_role_setting,
    NULLIF(:'AFEX_TARGET_LOGIN', '')::text AS explicit_target_login,
    CASE WHEN NULLIF(:'AFEX_TARGET_LOGIN', '') IS NULL
         THEN 'DISCOVERY' ELSE 'EXPLICIT' END::text AS target_mode;

-- 020 — Target LOGIN discovery and properties
SELECT 'A21R_SECTION_020_TARGET_LOGIN_DISCOVERY'::text AS section;

WITH runtime AS (
    SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'afex_core_runtime'
),
p2d20 AS (
    SELECT pg_catalog.to_regprocedure(
        'public.acquire_atomic_order_command_v1(uuid,uuid,uuid,text,text,text,text,timestamp with time zone)'
    ) AS oid
),
direct_execute AS (
    SELECT acl_state.grantee
    FROM pg_catalog.pg_proc AS function_state
    CROSS JOIN LATERAL pg_catalog.unnest(
        function_state.proacl
    ) AS acl_item(value)
    CROSS JOIN LATERAL pg_catalog.aclexplode(
        ARRAY[acl_item.value]::aclitem[]
    ) AS acl_state
    WHERE function_state.oid = (SELECT oid FROM p2d20)
      AND acl_state.privilege_type = 'EXECUTE'
),
candidates AS (
    SELECT role_state.*,
           runtime.oid AS runtime_oid,
           EXISTS (
               SELECT 1 FROM pg_catalog.pg_auth_members AS membership
               WHERE membership.member = role_state.oid
                 AND membership.roleid = runtime.oid
           ) AS direct_runtime_membership,
           CASE WHEN runtime.oid IS NULL THEN false ELSE
               pg_catalog.pg_has_role(role_state.oid, runtime.oid, 'SET')
           END AS can_set_runtime,
           EXISTS (
               SELECT 1 FROM direct_execute
               WHERE direct_execute.grantee = role_state.oid
           ) AS direct_p2d20_execute
    FROM pg_catalog.pg_roles AS role_state
    CROSS JOIN runtime
),
selected AS (
    SELECT * FROM candidates
    WHERE (
        NULLIF(:'AFEX_TARGET_LOGIN', '') IS NOT NULL
        AND rolname = NULLIF(:'AFEX_TARGET_LOGIN', '')
    ) OR (
        NULLIF(:'AFEX_TARGET_LOGIN', '') IS NULL
        AND rolcanlogin
        AND NOT rolsuper
        AND rolname !~ '^pg_'
        AND rolname <> 'postgres'
        AND (
            direct_runtime_membership
            OR can_set_runtime
            OR direct_p2d20_execute
        )
    )
)
SELECT
    role_state.rolname::text AS role_name,
    role_state.oid,
    role_state.rolcanlogin,
    role_state.rolsuper,
    role_state.rolinherit,
    role_state.rolcreatedb,
    role_state.rolcreaterole,
    role_state.rolreplication,
    role_state.rolbypassrls,
    role_state.rolconnlimit,
    role_state.rolvaliduntil,
    role_state.direct_runtime_membership,
    role_state.can_set_runtime,
    role_state.direct_p2d20_execute
FROM selected AS role_state
ORDER BY role_state.rolname;

SELECT
    role_state.rolname::text AS role_name,
    database_state.datname::text AS database_name,
    setting_state.setconfig
FROM pg_catalog.pg_db_role_setting AS setting_state
JOIN pg_catalog.pg_roles AS role_state
  ON role_state.oid = setting_state.setrole
LEFT JOIN pg_catalog.pg_database AS database_state
  ON database_state.oid = setting_state.setdatabase
WHERE (
    NULLIF(:'AFEX_TARGET_LOGIN', '') IS NOT NULL
    AND role_state.rolname = NULLIF(:'AFEX_TARGET_LOGIN', '')
) OR (
    NULLIF(:'AFEX_TARGET_LOGIN', '') IS NULL
    AND role_state.rolcanlogin
    AND NOT role_state.rolsuper
    AND role_state.rolname !~ '^pg_'
           AND (
               EXISTS (
                   SELECT 1 FROM pg_catalog.pg_auth_members AS membership
                   WHERE membership.member = oid
                     AND membership.roleid = pg_catalog.to_regrole(
                         'afex_core_runtime'
                     )
               )
               OR pg_catalog.pg_has_role(
            role_state.oid,
            pg_catalog.to_regrole('afex_core_runtime'),
            'SET'
        )
        OR EXISTS (
            SELECT 1
            FROM pg_catalog.pg_proc AS function_state
            CROSS JOIN LATERAL pg_catalog.unnest(
                function_state.proacl
            ) AS acl_item(value)
            CROSS JOIN LATERAL pg_catalog.aclexplode(
                ARRAY[acl_item.value]::aclitem[]
            ) AS acl_state
            WHERE function_state.oid = pg_catalog.to_regprocedure(
                'public.acquire_atomic_order_command_v1(uuid,uuid,uuid,text,text,text,text,timestamp with time zone)'
            )
              AND acl_state.grantee = role_state.oid
              AND acl_state.privilege_type = 'EXECUTE'
        )
    )
)
ORDER BY role_name, database_name NULLS FIRST;

-- 030 — Target LOGIN direct memberships
SELECT 'A21R_SECTION_030_TARGET_DIRECT_MEMBERSHIPS'::text AS section;

WITH targets AS (
    SELECT role_state.oid, role_state.rolname
    FROM pg_catalog.pg_roles AS role_state
    WHERE (
        NULLIF(:'AFEX_TARGET_LOGIN', '') IS NOT NULL
        AND role_state.rolname = NULLIF(:'AFEX_TARGET_LOGIN', '')
    ) OR (
        NULLIF(:'AFEX_TARGET_LOGIN', '') IS NULL
        AND role_state.rolcanlogin
        AND NOT role_state.rolsuper
        AND role_state.rolname !~ '^pg_'
        AND role_state.rolname <> 'postgres'
           AND (
               EXISTS (
                   SELECT 1 FROM pg_catalog.pg_auth_members AS membership
                   WHERE membership.member = oid
                     AND membership.roleid = pg_catalog.to_regrole(
                         'afex_core_runtime'
                     )
               )
               OR pg_catalog.pg_has_role(
                role_state.oid,
                pg_catalog.to_regrole('afex_core_runtime'),
                'SET'
            )
            OR EXISTS (
                SELECT 1
                FROM pg_catalog.pg_proc AS function_state
                CROSS JOIN LATERAL pg_catalog.unnest(
                    function_state.proacl
                ) AS acl_item(value)
                CROSS JOIN LATERAL pg_catalog.aclexplode(
                    ARRAY[acl_item.value]::aclitem[]
                ) AS acl_state
                WHERE function_state.oid = pg_catalog.to_regprocedure(
                    'public.acquire_atomic_order_command_v1(uuid,uuid,uuid,text,text,text,text,timestamp with time zone)'
                )
                  AND acl_state.grantee = role_state.oid
                  AND acl_state.privilege_type = 'EXECUTE'
            )
        )
    )
)
SELECT
    target.rolname::text AS member_name,
    parent.rolname::text AS granted_role,
    grantor.rolname::text AS grantor,
    membership.admin_option,
    membership.inherit_option,
    membership.set_option
FROM targets AS target
JOIN pg_catalog.pg_auth_members AS membership
  ON membership.member = target.oid
JOIN pg_catalog.pg_roles AS parent ON parent.oid = membership.roleid
JOIN pg_catalog.pg_roles AS grantor ON grantor.oid = membership.grantor
ORDER BY member_name, granted_role, grantor;

-- 040 — Effective role graph
SELECT 'A21R_SECTION_040_EFFECTIVE_ROLE_GRAPH'::text AS section;

WITH RECURSIVE targets AS (
    SELECT role_state.oid, role_state.rolname
    FROM pg_catalog.pg_roles AS role_state
    WHERE (
        NULLIF(:'AFEX_TARGET_LOGIN', '') IS NOT NULL
        AND role_state.rolname = NULLIF(:'AFEX_TARGET_LOGIN', '')
    ) OR (
        NULLIF(:'AFEX_TARGET_LOGIN', '') IS NULL
        AND role_state.rolcanlogin
        AND NOT role_state.rolsuper
        AND role_state.rolname !~ '^pg_'
        AND role_state.rolname <> 'postgres'
           AND (
               EXISTS (
                   SELECT 1 FROM pg_catalog.pg_auth_members AS membership
                   WHERE membership.member = oid
                     AND membership.roleid = pg_catalog.to_regrole(
                         'afex_core_runtime'
                     )
               )
               OR pg_catalog.pg_has_role(
                role_state.oid,
                pg_catalog.to_regrole('afex_core_runtime'),
                'SET'
            )
            OR EXISTS (
                SELECT 1
                FROM pg_catalog.pg_proc AS function_state
                CROSS JOIN LATERAL pg_catalog.unnest(
                    function_state.proacl
                ) AS acl_item(value)
                CROSS JOIN LATERAL pg_catalog.aclexplode(
                    ARRAY[acl_item.value]::aclitem[]
                ) AS acl_state
                WHERE function_state.oid = pg_catalog.to_regprocedure(
                    'public.acquire_atomic_order_command_v1(uuid,uuid,uuid,text,text,text,text,timestamp with time zone)'
                )
                  AND acl_state.grantee = role_state.oid
                  AND acl_state.privilege_type = 'EXECUTE'
            )
        )
    )
),
role_graph AS (
    SELECT
        target.oid AS source_oid,
        target.rolname::text AS source_role,
        membership.roleid AS reached_oid,
        ARRAY[target.oid, membership.roleid]::oid[] AS path,
        1 AS depth
    FROM targets AS target
    JOIN pg_catalog.pg_auth_members AS membership
      ON membership.member = target.oid
    UNION ALL
    SELECT
        graph.source_oid,
        graph.source_role,
        membership.roleid,
        graph.path || membership.roleid,
        graph.depth + 1
    FROM role_graph AS graph
    JOIN pg_catalog.pg_auth_members AS membership
      ON membership.member = graph.reached_oid
    WHERE NOT membership.roleid = ANY(graph.path)
      AND graph.depth < 32
)
SELECT
    graph.source_role,
    reached.rolname::text AS reachable_role,
    graph.depth,
    ARRAY(
        SELECT path_role.rolname::text
        FROM pg_catalog.unnest(graph.path) WITH ORDINALITY AS path(oid, ord)
        JOIN pg_catalog.pg_roles AS path_role ON path_role.oid = path.oid
        ORDER BY path.ord
    ) AS role_path,
    pg_catalog.pg_has_role(graph.source_oid, graph.reached_oid, 'MEMBER')
        AS has_member,
    pg_catalog.pg_has_role(graph.source_oid, graph.reached_oid, 'USAGE')
        AS has_usage,
    pg_catalog.pg_has_role(graph.source_oid, graph.reached_oid, 'SET')
        AS has_set
FROM role_graph AS graph
JOIN pg_catalog.pg_roles AS reached ON reached.oid = graph.reached_oid
ORDER BY source_role, depth, reachable_role;

-- 050 — SET ROLE eligibility graph
SELECT 'A21R_SECTION_050_SET_ROLE_ELIGIBILITY'::text AS section;

WITH targets AS (
    SELECT oid, rolname FROM pg_catalog.pg_roles
    WHERE rolcanlogin
      AND (
          rolname = NULLIF(:'AFEX_TARGET_LOGIN', '')
          OR (
              NULLIF(:'AFEX_TARGET_LOGIN', '') IS NULL
              AND NOT rolsuper
              AND rolname !~ '^pg_'
           AND (
               EXISTS (
                   SELECT 1 FROM pg_catalog.pg_auth_members AS membership
                   WHERE membership.member = oid
                     AND membership.roleid = pg_catalog.to_regrole(
                         'afex_core_runtime'
                     )
               )
               OR pg_catalog.pg_has_role(
                   oid, pg_catalog.to_regrole('afex_core_runtime'), 'SET'
               )
               OR EXISTS (
                   SELECT 1
                   FROM pg_catalog.pg_proc AS function_state
                   CROSS JOIN LATERAL pg_catalog.unnest(
                       function_state.proacl
                   ) AS acl_item(value)
                   CROSS JOIN LATERAL pg_catalog.aclexplode(
                       ARRAY[acl_item.value]::aclitem[]
                   ) AS acl_state
                   WHERE function_state.oid = pg_catalog.to_regprocedure(
                       'public.acquire_atomic_order_command_v1(uuid,uuid,uuid,text,text,text,text,timestamp with time zone)'
                   )
                     AND acl_state.grantee = pg_catalog.to_regrole(rolname)
                     AND acl_state.privilege_type = 'EXECUTE'
               )
           )
          )
      )
)
SELECT
    target.rolname::text AS login_role,
    candidate.rolname::text AS settable_role,
    pg_catalog.pg_has_role(target.oid, candidate.oid, 'SET') AS can_set_role,
    candidate.rolsuper,
    candidate.rolbypassrls,
    candidate.rolcanlogin
FROM targets AS target
CROSS JOIN pg_catalog.pg_roles AS candidate
WHERE target.oid <> candidate.oid
  AND pg_catalog.pg_has_role(target.oid, candidate.oid, 'SET')
ORDER BY login_role, settable_role;

-- 060 — afex_core_runtime properties
SELECT 'A21R_SECTION_060_RUNTIME_ROLE_PROPERTIES'::text AS section;

SELECT
    role_state.rolname::text AS role_name,
    role_state.oid,
    role_state.rolcanlogin,
    role_state.rolsuper,
    role_state.rolinherit,
    role_state.rolcreatedb,
    role_state.rolcreaterole,
    role_state.rolreplication,
    role_state.rolbypassrls,
    role_state.rolconnlimit,
    role_state.rolvaliduntil
FROM pg_catalog.pg_roles AS role_state
WHERE role_state.rolname = 'afex_core_runtime';

SELECT
    database_state.datname::text AS database_name,
    setting_state.setconfig
FROM pg_catalog.pg_db_role_setting AS setting_state
LEFT JOIN pg_catalog.pg_database AS database_state
  ON database_state.oid = setting_state.setdatabase
WHERE setting_state.setrole = pg_catalog.to_regrole('afex_core_runtime')
ORDER BY database_name NULLS FIRST;

-- 070 — afex_core_runtime members and parents
SELECT 'A21R_SECTION_070_RUNTIME_MEMBERS_AND_PARENTS'::text AS section;

SELECT
    member.rolname::text AS member_role,
    parent.rolname::text AS granted_role,
    grantor.rolname::text AS grantor,
    membership.admin_option,
    membership.inherit_option,
    membership.set_option
FROM pg_catalog.pg_auth_members AS membership
JOIN pg_catalog.pg_roles AS member ON member.oid = membership.member
JOIN pg_catalog.pg_roles AS parent ON parent.oid = membership.roleid
JOIN pg_catalog.pg_roles AS grantor ON grantor.oid = membership.grantor
WHERE membership.roleid = pg_catalog.to_regrole('afex_core_runtime')
   OR membership.member = pg_catalog.to_regrole('afex_core_runtime')
ORDER BY member_role, granted_role, grantor;

-- 080 — P2D.20 function identity and ownership
SELECT 'A21R_SECTION_080_P2D20_FUNCTION_IDENTITY'::text AS section;

SELECT
    function_state.oid,
    namespace_state.nspname::text AS schema_name,
    function_state.proname::text AS function_name,
    pg_catalog.pg_get_function_identity_arguments(function_state.oid)::text
        AS identity_arguments,
    pg_catalog.pg_get_userbyid(function_state.proowner)::text AS owner,
    function_state.prosecdef AS security_definer,
    function_state.provolatile::text AS volatility,
    function_state.proparallel::text AS parallel_safety,
    function_state.proconfig,
    pg_catalog.pg_get_function_result(function_state.oid)::text AS result_type
FROM pg_catalog.pg_proc AS function_state
JOIN pg_catalog.pg_namespace AS namespace_state
  ON namespace_state.oid = function_state.pronamespace
WHERE function_state.oid = pg_catalog.to_regprocedure(
    'public.acquire_atomic_order_command_v1(uuid,uuid,uuid,text,text,text,text,timestamp with time zone)'
);

-- 090 — P2D.20 EXECUTE ACL provenance
SELECT 'A21R_SECTION_090_P2D20_EXECUTE_ACL'::text AS section;

WITH function_state AS (
    SELECT * FROM pg_catalog.pg_proc
    WHERE oid = pg_catalog.to_regprocedure(
        'public.acquire_atomic_order_command_v1(uuid,uuid,uuid,text,text,text,text,timestamp with time zone)'
    )
),
direct_acl AS (
    SELECT acl_state.*
    FROM function_state
    CROSS JOIN LATERAL pg_catalog.unnest(
        function_state.proacl
    ) AS acl_item(value)
    CROSS JOIN LATERAL pg_catalog.aclexplode(
        ARRAY[acl_item.value]::aclitem[]
    ) AS acl_state
)
SELECT
    CASE WHEN acl_state.grantee = 0 THEN 'PUBLIC'
         ELSE pg_catalog.pg_get_userbyid(acl_state.grantee)::text END AS grantee,
    CASE WHEN acl_state.grantor = 0 THEN 'PUBLIC'
         ELSE pg_catalog.pg_get_userbyid(acl_state.grantor)::text END AS grantor,
    acl_state.privilege_type::text,
    acl_state.is_grantable,
    false AS implicit_public_default
FROM direct_acl AS acl_state
UNION ALL
SELECT
    'PUBLIC', pg_catalog.pg_get_userbyid(function_state.proowner)::text,
    'EXECUTE', false, true
FROM function_state
WHERE function_state.proacl IS NULL
ORDER BY grantee, privilege_type, grantor;

-- 100 — All public function EXECUTE privileges for target
SELECT 'A21R_SECTION_100_PUBLIC_FUNCTION_EXECUTE'::text AS section;

WITH targets AS (
    SELECT oid, rolname FROM pg_catalog.pg_roles
    WHERE rolname = 'afex_core_runtime'
       OR rolname = NULLIF(:'AFEX_TARGET_LOGIN', '')
       OR (
           NULLIF(:'AFEX_TARGET_LOGIN', '') IS NULL
           AND rolcanlogin AND NOT rolsuper AND rolname !~ '^pg_'
           AND rolname <> 'postgres'
           AND (
               EXISTS (
                   SELECT 1 FROM pg_catalog.pg_auth_members AS membership
                   WHERE membership.member = oid
                     AND membership.roleid = pg_catalog.to_regrole(
                         'afex_core_runtime'
                     )
               )
               OR pg_catalog.pg_has_role(
                   oid, pg_catalog.to_regrole('afex_core_runtime'), 'SET'
               )
               OR EXISTS (
                   SELECT 1
                   FROM pg_catalog.pg_proc AS function_state
                   CROSS JOIN LATERAL pg_catalog.unnest(
                       function_state.proacl
                   ) AS acl_item(value)
                   CROSS JOIN LATERAL pg_catalog.aclexplode(
                       ARRAY[acl_item.value]::aclitem[]
                   ) AS acl_state
                   WHERE function_state.oid = pg_catalog.to_regprocedure(
                       'public.acquire_atomic_order_command_v1(uuid,uuid,uuid,text,text,text,text,timestamp with time zone)'
                   )
                     AND acl_state.grantee = pg_catalog.to_regrole(rolname)
                     AND acl_state.privilege_type = 'EXECUTE'
               )
           )
       )
),
functions AS (
    SELECT function_state.*, namespace_state.nspname
    FROM pg_catalog.pg_proc AS function_state
    JOIN pg_catalog.pg_namespace AS namespace_state
      ON namespace_state.oid = function_state.pronamespace
    WHERE namespace_state.nspname !~ '^pg_'
      AND namespace_state.nspname <> 'information_schema'
),
direct_acl AS (
    SELECT
        function_state.oid AS function_oid,
        acl_state.grantee,
        acl_state.privilege_type::text AS privilege_type
    FROM functions AS function_state
    CROSS JOIN LATERAL pg_catalog.unnest(
        function_state.proacl
    ) AS acl_item(value)
    CROSS JOIN LATERAL pg_catalog.aclexplode(
        ARRAY[acl_item.value]::aclitem[]
    ) AS acl_state
)
SELECT
    target.rolname::text AS role_name,
    CASE WHEN target.rolname = 'afex_core_runtime'
         THEN 'POST_SET_RUNTIME' ELSE 'PRE_SET_TARGET' END::text AS role_state,
    function_state.oid,
    function_state.nspname::text AS schema_name,
    function_state.proname::text AS function_name,
    pg_catalog.pg_get_function_identity_arguments(function_state.oid)::text
        AS identity_arguments,
    pg_catalog.pg_get_userbyid(function_state.proowner)::text AS owner,
    function_state.prosecdef AS security_definer,
    pg_catalog.has_function_privilege(
        target.oid, function_state.oid, 'EXECUTE'
    ) AS effective_execute,
    EXISTS (
        SELECT 1 FROM direct_acl AS acl_state
        WHERE acl_state.function_oid = function_state.oid
          AND acl_state.grantee = target.oid
          AND acl_state.privilege_type = 'EXECUTE'
    ) AS direct_role_source,
    function_state.proacl IS NULL OR EXISTS (
        SELECT 1 FROM direct_acl AS acl_state
        WHERE acl_state.function_oid = function_state.oid
          AND acl_state.grantee = 0
          AND acl_state.privilege_type = 'EXECUTE'
    ) AS public_source,
    EXISTS (
        SELECT 1 FROM direct_acl AS acl_state
        WHERE acl_state.function_oid = function_state.oid
          AND acl_state.grantee NOT IN (0, target.oid)
          AND acl_state.privilege_type = 'EXECUTE'
          AND pg_catalog.pg_has_role(target.oid, acl_state.grantee, 'USAGE')
    ) AS inherited_membership_source,
    target.oid = function_state.proowner AS ownership_source,
    function_state.prosecdef AS security_definer_amplification
FROM targets AS target
CROSS JOIN functions AS function_state
WHERE pg_catalog.has_function_privilege(
    target.oid, function_state.oid, 'EXECUTE'
)
ORDER BY role_name, function_name, identity_arguments;

-- 110 — SECURITY DEFINER exposure
SELECT 'A21R_SECTION_110_SECURITY_DEFINER_EXPOSURE'::text AS section;

WITH targets AS (
    SELECT oid, rolname FROM pg_catalog.pg_roles
    WHERE rolname = 'afex_core_runtime'
       OR rolname = NULLIF(:'AFEX_TARGET_LOGIN', '')
       OR (
           NULLIF(:'AFEX_TARGET_LOGIN', '') IS NULL
           AND rolcanlogin AND NOT rolsuper AND rolname !~ '^pg_'
           AND (
               EXISTS (
                   SELECT 1 FROM pg_catalog.pg_auth_members AS membership
                   WHERE membership.member = oid
                     AND membership.roleid = pg_catalog.to_regrole(
                         'afex_core_runtime'
                     )
               )
               OR pg_catalog.pg_has_role(
                   oid, pg_catalog.to_regrole('afex_core_runtime'), 'SET'
               )
               OR EXISTS (
                   SELECT 1
                   FROM pg_catalog.pg_proc AS function_state
                   CROSS JOIN LATERAL pg_catalog.unnest(
                       function_state.proacl
                   ) AS acl_item(value)
                   CROSS JOIN LATERAL pg_catalog.aclexplode(
                       ARRAY[acl_item.value]::aclitem[]
                   ) AS acl_state
                   WHERE function_state.oid = pg_catalog.to_regprocedure(
                       'public.acquire_atomic_order_command_v1(uuid,uuid,uuid,text,text,text,text,timestamp with time zone)'
                   )
                     AND acl_state.grantee = pg_catalog.to_regrole(rolname)
                     AND acl_state.privilege_type = 'EXECUTE'
               )
           )
       )
)
SELECT
    target.rolname::text AS role_name,
    CASE WHEN target.rolname = 'afex_core_runtime'
         THEN 'POST_SET_RUNTIME' ELSE 'PRE_SET_TARGET' END::text AS role_state,
    namespace_state.nspname::text AS schema_name,
    function_state.proname::text AS function_name,
    pg_catalog.pg_get_function_identity_arguments(function_state.oid)::text
        AS identity_arguments,
    pg_catalog.pg_get_userbyid(function_state.proowner)::text AS owner,
    function_state.proconfig,
    pg_catalog.has_function_privilege(
        target.oid, function_state.oid, 'EXECUTE'
    ) AS effective_execute
FROM targets AS target
CROSS JOIN pg_catalog.pg_proc AS function_state
JOIN pg_catalog.pg_namespace AS namespace_state
  ON namespace_state.oid = function_state.pronamespace
WHERE function_state.prosecdef
  AND namespace_state.nspname !~ '^pg_'
  AND namespace_state.nspname <> 'information_schema'
  AND pg_catalog.has_function_privilege(
      target.oid, function_state.oid, 'EXECUTE'
  )
ORDER BY role_name, schema_name, function_name, identity_arguments;

-- 120 — Table/view privileges
SELECT 'A21R_SECTION_120_TABLE_VIEW_PRIVILEGES'::text AS section;

WITH targets AS (
    SELECT oid, rolname FROM pg_catalog.pg_roles
    WHERE rolname = 'afex_core_runtime'
       OR rolname = NULLIF(:'AFEX_TARGET_LOGIN', '')
       OR (
           NULLIF(:'AFEX_TARGET_LOGIN', '') IS NULL
           AND rolcanlogin AND NOT rolsuper AND rolname !~ '^pg_'
           AND (
               EXISTS (
                   SELECT 1 FROM pg_catalog.pg_auth_members AS membership
                   WHERE membership.member = oid
                     AND membership.roleid = pg_catalog.to_regrole(
                         'afex_core_runtime'
                     )
               )
               OR pg_catalog.pg_has_role(
                   oid, pg_catalog.to_regrole('afex_core_runtime'), 'SET'
               )
               OR EXISTS (
                   SELECT 1
                   FROM pg_catalog.pg_proc AS function_state
                   CROSS JOIN LATERAL pg_catalog.unnest(
                       function_state.proacl
                   ) AS acl_item(value)
                   CROSS JOIN LATERAL pg_catalog.aclexplode(
                       ARRAY[acl_item.value]::aclitem[]
                   ) AS acl_state
                   WHERE function_state.oid = pg_catalog.to_regprocedure(
                       'public.acquire_atomic_order_command_v1(uuid,uuid,uuid,text,text,text,text,timestamp with time zone)'
                   )
                     AND acl_state.grantee = pg_catalog.to_regrole(rolname)
                     AND acl_state.privilege_type = 'EXECUTE'
               )
           )
       )
),
objects AS (
    SELECT relation_state.*, namespace_state.nspname
    FROM pg_catalog.pg_class AS relation_state
    JOIN pg_catalog.pg_namespace AS namespace_state
      ON namespace_state.oid = relation_state.relnamespace
    WHERE namespace_state.nspname !~ '^pg_'
      AND namespace_state.nspname <> 'information_schema'
      AND relation_state.relkind IN ('r', 'p', 'v', 'm', 'f')
),
direct_acl AS (
    SELECT
        relation_state.oid AS relation_oid,
        acl_state.grantee,
        acl_state.privilege_type::text AS privilege_type,
        acl_state.is_grantable
    FROM objects AS relation_state
    CROSS JOIN LATERAL pg_catalog.unnest(
        relation_state.relacl
    ) AS acl_item(value)
    CROSS JOIN LATERAL pg_catalog.aclexplode(
        ARRAY[acl_item.value]::aclitem[]
    ) AS acl_state
),
privileges(privilege_type) AS (
    VALUES ('SELECT'::text), ('INSERT'), ('UPDATE'), ('DELETE'),
           ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')
)
SELECT
    target.rolname::text AS role_name,
    CASE WHEN target.rolname = 'afex_core_runtime'
         THEN 'POST_SET_RUNTIME' ELSE 'PRE_SET_TARGET' END::text AS role_state,
    object_state.nspname::text AS schema_name,
    object_state.relname::text AS object_name,
    object_state.relkind::text AS object_kind,
    pg_catalog.pg_get_userbyid(object_state.relowner)::text AS owner,
    privilege.privilege_type,
    pg_catalog.has_table_privilege(
        target.oid, object_state.oid, privilege.privilege_type
    ) AS effective_privilege,
    EXISTS (
        SELECT 1 FROM direct_acl AS acl_state
        WHERE acl_state.relation_oid = object_state.oid
          AND acl_state.grantee = target.oid
          AND acl_state.privilege_type = privilege.privilege_type
    ) AS direct_role_source,
    EXISTS (
        SELECT 1 FROM direct_acl AS acl_state
        WHERE acl_state.relation_oid = object_state.oid
          AND acl_state.grantee = 0
          AND acl_state.privilege_type = privilege.privilege_type
    ) AS public_source,
    EXISTS (
        SELECT 1 FROM direct_acl AS acl_state
        WHERE acl_state.relation_oid = object_state.oid
          AND acl_state.grantee NOT IN (0, target.oid)
          AND acl_state.privilege_type = privilege.privilege_type
          AND pg_catalog.pg_has_role(
              target.oid, acl_state.grantee, 'USAGE'
          )
    ) AS inherited_source,
    target.oid = object_state.relowner AS owner_source,
    object_state.relrowsecurity,
    object_state.relforcerowsecurity
FROM targets AS target
CROSS JOIN objects AS object_state
CROSS JOIN privileges AS privilege
WHERE pg_catalog.has_table_privilege(
    target.oid, object_state.oid, privilege.privilege_type
)
ORDER BY role_name, object_name, privilege_type;

-- 130 — Column privileges
SELECT 'A21R_SECTION_130_COLUMN_PRIVILEGES'::text AS section;

WITH targets AS (
    SELECT oid, rolname FROM pg_catalog.pg_roles
    WHERE rolname = 'afex_core_runtime'
       OR rolname = NULLIF(:'AFEX_TARGET_LOGIN', '')
       OR (
           NULLIF(:'AFEX_TARGET_LOGIN', '') IS NULL
           AND rolcanlogin AND NOT rolsuper AND rolname !~ '^pg_'
           AND (
               EXISTS (
                   SELECT 1 FROM pg_catalog.pg_auth_members AS membership
                   WHERE membership.member = oid
                     AND membership.roleid = pg_catalog.to_regrole(
                         'afex_core_runtime'
                     )
               )
               OR pg_catalog.pg_has_role(
                   oid, pg_catalog.to_regrole('afex_core_runtime'), 'SET'
               )
               OR EXISTS (
                   SELECT 1
                   FROM pg_catalog.pg_proc AS function_state
                   CROSS JOIN LATERAL pg_catalog.unnest(
                       function_state.proacl
                   ) AS acl_item(value)
                   CROSS JOIN LATERAL pg_catalog.aclexplode(
                       ARRAY[acl_item.value]::aclitem[]
                   ) AS acl_state
                   WHERE function_state.oid = pg_catalog.to_regprocedure(
                       'public.acquire_atomic_order_command_v1(uuid,uuid,uuid,text,text,text,text,timestamp with time zone)'
                   )
                     AND acl_state.grantee = pg_catalog.to_regrole(rolname)
                     AND acl_state.privilege_type = 'EXECUTE'
               )
           )
       )
),
columns AS (
    SELECT relation_state.oid AS relation_oid,
           relation_state.relname, namespace_state.nspname,
           relation_state.relowner,
           attribute_state.attnum, attribute_state.attname,
           attribute_state.attacl
    FROM pg_catalog.pg_attribute AS attribute_state
    JOIN pg_catalog.pg_class AS relation_state
      ON relation_state.oid = attribute_state.attrelid
    JOIN pg_catalog.pg_namespace AS namespace_state
      ON namespace_state.oid = relation_state.relnamespace
    WHERE namespace_state.nspname !~ '^pg_'
      AND namespace_state.nspname <> 'information_schema'
      AND relation_state.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND attribute_state.attnum > 0
      AND NOT attribute_state.attisdropped
),
direct_column_acl AS (
    SELECT
        column_state.relation_oid,
        column_state.attnum,
        acl_state.grantee,
        acl_state.privilege_type::text AS privilege_type,
        acl_state.is_grantable
    FROM columns AS column_state
    CROSS JOIN LATERAL pg_catalog.unnest(
        column_state.attacl
    ) AS acl_item(value)
    CROSS JOIN LATERAL pg_catalog.aclexplode(
        ARRAY[acl_item.value]::aclitem[]
    ) AS acl_state
),
privileges(privilege_type) AS (
    VALUES ('SELECT'::text), ('INSERT'), ('UPDATE'), ('REFERENCES')
)
SELECT
    target.rolname::text AS role_name,
    CASE WHEN target.rolname = 'afex_core_runtime'
         THEN 'POST_SET_RUNTIME' ELSE 'PRE_SET_TARGET' END::text AS role_state,
    column_state.nspname::text AS schema_name,
    column_state.relname::text AS object_name,
    column_state.attname::text AS column_name,
    privilege.privilege_type,
    pg_catalog.has_column_privilege(
        target.oid,
        column_state.relation_oid,
        column_state.attnum,
        privilege.privilege_type
    ) AS effective_privilege,
    EXISTS (
        SELECT 1 FROM direct_column_acl AS acl_state
        WHERE acl_state.relation_oid = column_state.relation_oid
          AND acl_state.attnum = column_state.attnum
          AND acl_state.grantee = target.oid
          AND acl_state.privilege_type = privilege.privilege_type
    ) AS direct_role_source,
    EXISTS (
        SELECT 1 FROM direct_column_acl AS acl_state
        WHERE acl_state.relation_oid = column_state.relation_oid
          AND acl_state.attnum = column_state.attnum
          AND acl_state.grantee = 0
          AND acl_state.privilege_type = privilege.privilege_type
    ) AS public_source,
    EXISTS (
        SELECT 1 FROM direct_column_acl AS acl_state
        WHERE acl_state.relation_oid = column_state.relation_oid
          AND acl_state.attnum = column_state.attnum
          AND acl_state.grantee NOT IN (0, target.oid)
          AND acl_state.privilege_type = privilege.privilege_type
          AND pg_catalog.pg_has_role(
              target.oid, acl_state.grantee, 'USAGE'
          )
    ) AS inherited_source,
    target.oid = column_state.relowner AS ownership_source
FROM targets AS target
CROSS JOIN columns AS column_state
CROSS JOIN privileges AS privilege
WHERE pg_catalog.has_column_privilege(
    target.oid,
    column_state.relation_oid,
    column_state.attnum,
    privilege.privilege_type
)
ORDER BY role_name, object_name, column_name, privilege_type;

SELECT
    namespace_state.nspname::text AS schema_name,
    relation_state.relname::text AS object_name,
    attribute_state.attname::text AS column_name,
    CASE WHEN acl_state.grantee = 0 THEN 'PUBLIC'
         ELSE pg_catalog.pg_get_userbyid(acl_state.grantee)::text END AS grantee,
    CASE WHEN acl_state.grantor = 0 THEN 'PUBLIC'
         ELSE pg_catalog.pg_get_userbyid(acl_state.grantor)::text END AS grantor,
    acl_state.privilege_type::text,
    acl_state.is_grantable
FROM pg_catalog.pg_attribute AS attribute_state
JOIN pg_catalog.pg_class AS relation_state
  ON relation_state.oid = attribute_state.attrelid
JOIN pg_catalog.pg_namespace AS namespace_state
  ON namespace_state.oid = relation_state.relnamespace
CROSS JOIN LATERAL pg_catalog.unnest(
    attribute_state.attacl
) AS acl_item(value)
CROSS JOIN LATERAL pg_catalog.aclexplode(
    ARRAY[acl_item.value]::aclitem[]
) AS acl_state
    WHERE namespace_state.nspname !~ '^pg_'
      AND namespace_state.nspname <> 'information_schema'
      AND attribute_state.attnum > 0
  AND NOT attribute_state.attisdropped
ORDER BY object_name, column_name, grantee, privilege_type;

-- 140 — Sequence privileges
SELECT 'A21R_SECTION_140_SEQUENCE_PRIVILEGES'::text AS section;

WITH targets AS (
    SELECT oid, rolname FROM pg_catalog.pg_roles
    WHERE rolname = 'afex_core_runtime'
       OR rolname = NULLIF(:'AFEX_TARGET_LOGIN', '')
       OR (
           NULLIF(:'AFEX_TARGET_LOGIN', '') IS NULL
           AND rolcanlogin AND NOT rolsuper AND rolname !~ '^pg_'
           AND (
               EXISTS (
                   SELECT 1 FROM pg_catalog.pg_auth_members AS membership
                   WHERE membership.member = oid
                     AND membership.roleid = pg_catalog.to_regrole(
                         'afex_core_runtime'
                     )
               )
               OR pg_catalog.pg_has_role(
                   oid, pg_catalog.to_regrole('afex_core_runtime'), 'SET'
               )
               OR EXISTS (
                   SELECT 1
                   FROM pg_catalog.pg_proc AS function_state
                   CROSS JOIN LATERAL pg_catalog.unnest(
                       function_state.proacl
                   ) AS acl_item(value)
                   CROSS JOIN LATERAL pg_catalog.aclexplode(
                       ARRAY[acl_item.value]::aclitem[]
                   ) AS acl_state
                   WHERE function_state.oid = pg_catalog.to_regprocedure(
                       'public.acquire_atomic_order_command_v1(uuid,uuid,uuid,text,text,text,text,timestamp with time zone)'
                   )
                     AND acl_state.grantee = pg_catalog.to_regrole(rolname)
                     AND acl_state.privilege_type = 'EXECUTE'
               )
           )
       )
),
sequences AS (
    SELECT relation_state.*, namespace_state.nspname
    FROM pg_catalog.pg_class AS relation_state
    JOIN pg_catalog.pg_namespace AS namespace_state
      ON namespace_state.oid = relation_state.relnamespace
    WHERE relation_state.relkind = 'S'
      AND namespace_state.nspname !~ '^pg_'
      AND namespace_state.nspname <> 'information_schema'
),
direct_acl AS (
    SELECT
        sequence_state.oid AS sequence_oid,
        acl_state.grantee,
        acl_state.privilege_type::text AS privilege_type
    FROM sequences AS sequence_state
    CROSS JOIN LATERAL pg_catalog.unnest(
        sequence_state.relacl
    ) AS acl_item(value)
    CROSS JOIN LATERAL pg_catalog.aclexplode(
        ARRAY[acl_item.value]::aclitem[]
    ) AS acl_state
),
privileges(privilege_type) AS (
    VALUES ('USAGE'::text), ('SELECT'), ('UPDATE')
)
SELECT
    target.rolname::text AS role_name,
    CASE WHEN target.rolname = 'afex_core_runtime'
         THEN 'POST_SET_RUNTIME' ELSE 'PRE_SET_TARGET' END::text AS role_state,
    sequence_state.nspname::text AS schema_name,
    sequence_state.relname::text AS sequence_name,
    pg_catalog.pg_get_userbyid(sequence_state.relowner)::text AS owner,
    privilege.privilege_type,
    pg_catalog.has_sequence_privilege(
        target.oid, sequence_state.oid, privilege.privilege_type
    ) AS effective_privilege,
    EXISTS (
        SELECT 1 FROM direct_acl AS acl_state
        WHERE acl_state.sequence_oid = sequence_state.oid
          AND acl_state.grantee = target.oid
          AND acl_state.privilege_type = privilege.privilege_type
    ) AS direct_role_source,
    EXISTS (
        SELECT 1 FROM direct_acl AS acl_state
        WHERE acl_state.sequence_oid = sequence_state.oid
          AND acl_state.grantee = 0
          AND acl_state.privilege_type = privilege.privilege_type
    ) AS public_source,
    EXISTS (
        SELECT 1 FROM direct_acl AS acl_state
        WHERE acl_state.sequence_oid = sequence_state.oid
          AND acl_state.grantee NOT IN (0, target.oid)
          AND acl_state.privilege_type = privilege.privilege_type
          AND pg_catalog.pg_has_role(
              target.oid, acl_state.grantee, 'USAGE'
          )
    ) AS inherited_source,
    target.oid = sequence_state.relowner AS owner_source
FROM targets AS target
CROSS JOIN sequences AS sequence_state
CROSS JOIN privileges AS privilege
WHERE pg_catalog.has_sequence_privilege(
    target.oid, sequence_state.oid, privilege.privilege_type
)
ORDER BY role_name, schema_name, sequence_name, privilege_type;

-- 150 — Schema privileges
SELECT 'A21R_SECTION_150_SCHEMA_PRIVILEGES'::text AS section;

WITH targets AS (
    SELECT oid, rolname FROM pg_catalog.pg_roles
    WHERE rolname = 'afex_core_runtime'
       OR rolname = NULLIF(:'AFEX_TARGET_LOGIN', '')
       OR (
           NULLIF(:'AFEX_TARGET_LOGIN', '') IS NULL
           AND rolcanlogin AND NOT rolsuper AND rolname !~ '^pg_'
           AND (
               EXISTS (
                   SELECT 1 FROM pg_catalog.pg_auth_members AS membership
                   WHERE membership.member = oid
                     AND membership.roleid = pg_catalog.to_regrole(
                         'afex_core_runtime'
                     )
               )
               OR pg_catalog.pg_has_role(
                   oid, pg_catalog.to_regrole('afex_core_runtime'), 'SET'
               )
               OR EXISTS (
                   SELECT 1
                   FROM pg_catalog.pg_proc AS function_state
                   CROSS JOIN LATERAL pg_catalog.unnest(
                       function_state.proacl
                   ) AS acl_item(value)
                   CROSS JOIN LATERAL pg_catalog.aclexplode(
                       ARRAY[acl_item.value]::aclitem[]
                   ) AS acl_state
                   WHERE function_state.oid = pg_catalog.to_regprocedure(
                       'public.acquire_atomic_order_command_v1(uuid,uuid,uuid,text,text,text,text,timestamp with time zone)'
                   )
                     AND acl_state.grantee = pg_catalog.to_regrole(rolname)
                     AND acl_state.privilege_type = 'EXECUTE'
               )
           )
       )
),
direct_acl AS (
    SELECT
        namespace_state.oid AS namespace_oid,
        acl_state.grantee,
        acl_state.privilege_type::text AS privilege_type
    FROM pg_catalog.pg_namespace AS namespace_state
    CROSS JOIN LATERAL pg_catalog.unnest(
        namespace_state.nspacl
    ) AS acl_item(value)
    CROSS JOIN LATERAL pg_catalog.aclexplode(
        ARRAY[acl_item.value]::aclitem[]
    ) AS acl_state
),
privileges(privilege_type) AS (VALUES ('USAGE'::text), ('CREATE'))
SELECT
    target.rolname::text AS role_name,
    CASE WHEN target.rolname = 'afex_core_runtime'
         THEN 'POST_SET_RUNTIME' ELSE 'PRE_SET_TARGET' END::text AS role_state,
    namespace_state.nspname::text AS schema_name,
    pg_catalog.pg_get_userbyid(namespace_state.nspowner)::text AS owner,
    privilege.privilege_type,
    pg_catalog.has_schema_privilege(
        target.oid, namespace_state.oid, privilege.privilege_type
    ) AS effective_privilege,
    EXISTS (
        SELECT 1 FROM direct_acl AS acl_state
        WHERE acl_state.namespace_oid = namespace_state.oid
          AND acl_state.grantee = target.oid
          AND acl_state.privilege_type = privilege.privilege_type
    ) AS direct_role_source,
    EXISTS (
        SELECT 1 FROM direct_acl AS acl_state
        WHERE acl_state.namespace_oid = namespace_state.oid
          AND acl_state.grantee = 0
          AND acl_state.privilege_type = privilege.privilege_type
    ) AS public_source,
    EXISTS (
        SELECT 1 FROM direct_acl AS acl_state
        WHERE acl_state.namespace_oid = namespace_state.oid
          AND acl_state.grantee NOT IN (0, target.oid)
          AND acl_state.privilege_type = privilege.privilege_type
          AND pg_catalog.pg_has_role(
              target.oid, acl_state.grantee, 'USAGE'
          )
    ) AS inherited_source,
    target.oid = namespace_state.nspowner AS owner_source
FROM targets AS target
CROSS JOIN pg_catalog.pg_namespace AS namespace_state
CROSS JOIN privileges AS privilege
WHERE namespace_state.nspname !~ '^pg_'
  AND namespace_state.nspname <> 'information_schema'
  AND pg_catalog.has_schema_privilege(
    target.oid, namespace_state.oid, privilege.privilege_type
)
ORDER BY role_name, schema_name, privilege_type;

-- 160 — Non-public schema access
SELECT 'A21R_SECTION_160_NON_PUBLIC_SCHEMA_ACCESS'::text AS section;

WITH targets AS (
    SELECT oid, rolname FROM pg_catalog.pg_roles
    WHERE rolname = 'afex_core_runtime'
       OR rolname = NULLIF(:'AFEX_TARGET_LOGIN', '')
       OR (
           NULLIF(:'AFEX_TARGET_LOGIN', '') IS NULL
           AND rolcanlogin AND NOT rolsuper AND rolname !~ '^pg_'
           AND rolname <> 'postgres'
           AND (
               EXISTS (
                   SELECT 1 FROM pg_catalog.pg_auth_members AS membership
                   WHERE membership.member = oid
                     AND membership.roleid = pg_catalog.to_regrole(
                         'afex_core_runtime'
                     )
               )
               OR pg_catalog.pg_has_role(
                   oid, pg_catalog.to_regrole('afex_core_runtime'), 'SET'
               )
               OR EXISTS (
                   SELECT 1
                   FROM pg_catalog.pg_proc AS function_state
                   CROSS JOIN LATERAL pg_catalog.unnest(
                       function_state.proacl
                   ) AS acl_item(value)
                   CROSS JOIN LATERAL pg_catalog.aclexplode(
                       ARRAY[acl_item.value]::aclitem[]
                   ) AS acl_state
                   WHERE function_state.oid = pg_catalog.to_regprocedure(
                       'public.acquire_atomic_order_command_v1(uuid,uuid,uuid,text,text,text,text,timestamp with time zone)'
                   )
                     AND acl_state.grantee = pg_catalog.to_regrole(rolname)
                     AND acl_state.privilege_type = 'EXECUTE'
               )
           )
       )
),
direct_acl AS (
    SELECT
        namespace_state.oid AS namespace_oid,
        acl_state.grantee,
        acl_state.privilege_type::text AS privilege_type
    FROM pg_catalog.pg_namespace AS namespace_state
    CROSS JOIN LATERAL pg_catalog.unnest(
        namespace_state.nspacl
    ) AS acl_item(value)
    CROSS JOIN LATERAL pg_catalog.aclexplode(
        ARRAY[acl_item.value]::aclitem[]
    ) AS acl_state
)
SELECT
    target.rolname::text AS role_name,
    CASE WHEN target.rolname = 'afex_core_runtime'
         THEN 'POST_SET_RUNTIME' ELSE 'PRE_SET_TARGET' END::text AS role_state,
    namespace_state.nspname::text AS schema_name,
    pg_catalog.pg_get_userbyid(namespace_state.nspowner)::text AS owner,
    pg_catalog.has_schema_privilege(
        target.oid, namespace_state.oid, 'USAGE'
    ) AS usage_privilege,
    pg_catalog.has_schema_privilege(
        target.oid, namespace_state.oid, 'CREATE'
    ) AS create_privilege,
    EXISTS (
        SELECT 1 FROM direct_acl AS acl_state
        WHERE acl_state.namespace_oid = namespace_state.oid
          AND acl_state.grantee = target.oid
          AND acl_state.privilege_type = 'USAGE'
    ) AS direct_usage_source,
    EXISTS (
        SELECT 1 FROM direct_acl AS acl_state
        WHERE acl_state.namespace_oid = namespace_state.oid
          AND acl_state.grantee = target.oid
          AND acl_state.privilege_type = 'CREATE'
    ) AS direct_create_source,
    EXISTS (
        SELECT 1 FROM direct_acl AS acl_state
        WHERE acl_state.namespace_oid = namespace_state.oid
          AND acl_state.grantee = 0
          AND acl_state.privilege_type = 'USAGE'
    ) AS public_usage_source,
    EXISTS (
        SELECT 1 FROM direct_acl AS acl_state
        WHERE acl_state.namespace_oid = namespace_state.oid
          AND acl_state.grantee NOT IN (0, target.oid)
          AND acl_state.privilege_type = 'USAGE'
          AND pg_catalog.pg_has_role(
              target.oid, acl_state.grantee, 'USAGE'
          )
    ) AS inherited_usage_source,
    target.oid = namespace_state.nspowner AS owner_source,
    namespace_state.nspname IN (
        'auth', 'storage', 'vault', 'realtime', 'extensions',
        'supabase_functions', 'graphql', 'graphql_public'
    ) AS sensitive_schema
FROM targets AS target
CROSS JOIN pg_catalog.pg_namespace AS namespace_state
WHERE namespace_state.nspname <> 'public'
  AND namespace_state.nspname NOT LIKE 'pg\_%' ESCAPE '\'
  AND namespace_state.nspname <> 'information_schema'
  AND (
      pg_catalog.has_schema_privilege(
          target.oid, namespace_state.oid, 'USAGE'
      )
      OR pg_catalog.has_schema_privilege(
          target.oid, namespace_state.oid, 'CREATE'
      )
  )
ORDER BY role_name, schema_name;

-- 170 — Object ownership exposure
SELECT 'A21R_SECTION_170_OBJECT_OWNERSHIP_EXPOSURE'::text AS section;

WITH targets AS (
    SELECT oid, rolname FROM pg_catalog.pg_roles
    WHERE rolname = 'afex_core_runtime'
       OR rolname = NULLIF(:'AFEX_TARGET_LOGIN', '')
       OR (
           NULLIF(:'AFEX_TARGET_LOGIN', '') IS NULL
           AND rolcanlogin AND NOT rolsuper AND rolname !~ '^pg_'
           AND (
               EXISTS (
                   SELECT 1 FROM pg_catalog.pg_auth_members AS membership
                   WHERE membership.member = oid
                     AND membership.roleid = pg_catalog.to_regrole(
                         'afex_core_runtime'
                     )
               )
               OR pg_catalog.pg_has_role(
                   oid, pg_catalog.to_regrole('afex_core_runtime'), 'SET'
               )
               OR EXISTS (
                   SELECT 1
                   FROM pg_catalog.pg_proc AS function_state
                   CROSS JOIN LATERAL pg_catalog.unnest(
                       function_state.proacl
                   ) AS acl_item(value)
                   CROSS JOIN LATERAL pg_catalog.aclexplode(
                       ARRAY[acl_item.value]::aclitem[]
                   ) AS acl_state
                   WHERE function_state.oid = pg_catalog.to_regprocedure(
                       'public.acquire_atomic_order_command_v1(uuid,uuid,uuid,text,text,text,text,timestamp with time zone)'
                   )
                     AND acl_state.grantee = pg_catalog.to_regrole(rolname)
                     AND acl_state.privilege_type = 'EXECUTE'
               )
           )
       )
),
owners AS (
    SELECT target.rolname::text AS target_role,
           owner_state.oid AS owner_oid,
           owner_state.rolname::text AS owner_role,
           target.oid = owner_state.oid AS direct_owner_identity,
           pg_catalog.pg_has_role(target.oid, owner_state.oid, 'SET')
               AS can_set_owner
    FROM targets AS target
    CROSS JOIN pg_catalog.pg_roles AS owner_state
    WHERE target.oid = owner_state.oid
       OR pg_catalog.pg_has_role(target.oid, owner_state.oid, 'SET')
),
owned_objects AS (
    SELECT namespace_state.nspname::text AS schema_name,
           relation_state.relname::text AS object_name,
           relation_state.relkind::text AS object_kind,
           relation_state.relowner AS owner_oid
    FROM pg_catalog.pg_class AS relation_state
    JOIN pg_catalog.pg_namespace AS namespace_state
      ON namespace_state.oid = relation_state.relnamespace
    WHERE namespace_state.nspname NOT LIKE 'pg\_%' ESCAPE '\'
    UNION ALL
    SELECT namespace_state.nspname::text,
           function_state.proname::text || '(' ||
               pg_catalog.pg_get_function_identity_arguments(function_state.oid)
               || ')',
           'function', function_state.proowner
    FROM pg_catalog.pg_proc AS function_state
    JOIN pg_catalog.pg_namespace AS namespace_state
      ON namespace_state.oid = function_state.pronamespace
    WHERE namespace_state.nspname NOT LIKE 'pg\_%' ESCAPE '\'
    UNION ALL
    SELECT namespace_state.nspname::text,
           namespace_state.nspname::text,
           'schema', namespace_state.nspowner
    FROM pg_catalog.pg_namespace AS namespace_state
    WHERE namespace_state.nspname NOT LIKE 'pg\_%' ESCAPE '\'
)
SELECT
    owner_state.target_role,
    owner_state.owner_role,
    owner_state.direct_owner_identity,
    owner_state.can_set_owner,
    object_state.schema_name,
    object_state.object_name,
    object_state.object_kind
FROM owners AS owner_state
JOIN owned_objects AS object_state
  ON object_state.owner_oid = owner_state.owner_oid
ORDER BY target_role, owner_role, schema_name, object_name;

-- 180 — RLS and FORCE RLS posture
SELECT 'A21R_SECTION_180_RLS_FORCE_RLS_POSTURE'::text AS section;

WITH targets AS (
    SELECT oid, rolname, rolsuper, rolbypassrls
    FROM pg_catalog.pg_roles
    WHERE rolname = 'afex_core_runtime'
       OR rolname = NULLIF(:'AFEX_TARGET_LOGIN', '')
       OR (
           NULLIF(:'AFEX_TARGET_LOGIN', '') IS NULL
           AND rolcanlogin AND NOT rolsuper AND rolname !~ '^pg_'
           AND (
               EXISTS (
                   SELECT 1 FROM pg_catalog.pg_auth_members AS membership
                   WHERE membership.member = oid
                     AND membership.roleid = pg_catalog.to_regrole(
                         'afex_core_runtime'
                     )
               )
               OR pg_catalog.pg_has_role(
                   oid, pg_catalog.to_regrole('afex_core_runtime'), 'SET'
               )
               OR EXISTS (
                   SELECT 1
                   FROM pg_catalog.pg_proc AS function_state
                   CROSS JOIN LATERAL pg_catalog.unnest(
                       function_state.proacl
                   ) AS acl_item(value)
                   CROSS JOIN LATERAL pg_catalog.aclexplode(
                       ARRAY[acl_item.value]::aclitem[]
                   ) AS acl_state
                   WHERE function_state.oid = pg_catalog.to_regprocedure(
                       'public.acquire_atomic_order_command_v1(uuid,uuid,uuid,text,text,text,text,timestamp with time zone)'
                   )
                     AND acl_state.grantee = pg_catalog.to_regrole(rolname)
                     AND acl_state.privilege_type = 'EXECUTE'
               )
           )
       )
),
tables AS (
    SELECT relation_state.*, namespace_state.nspname
    FROM pg_catalog.pg_class AS relation_state
    JOIN pg_catalog.pg_namespace AS namespace_state
      ON namespace_state.oid = relation_state.relnamespace
    WHERE relation_state.relkind IN ('r', 'p')
      AND namespace_state.nspname !~ '^pg_'
      AND namespace_state.nspname <> 'information_schema'
)
SELECT
    target.rolname::text AS role_name,
    table_state.nspname::text AS schema_name,
    table_state.relname::text AS table_name,
    pg_catalog.pg_get_userbyid(table_state.relowner)::text AS owner,
    target.rolsuper,
    target.rolbypassrls,
    target.oid = table_state.relowner AS owns_table,
    table_state.relrowsecurity,
    table_state.relforcerowsecurity,
    pg_catalog.has_table_privilege(target.oid, table_state.oid, 'SELECT')
    OR pg_catalog.has_table_privilege(target.oid, table_state.oid, 'INSERT')
    OR pg_catalog.has_table_privilege(target.oid, table_state.oid, 'UPDATE')
    OR pg_catalog.has_table_privilege(target.oid, table_state.oid, 'DELETE')
        AS has_any_dml_privilege
FROM targets AS target
CROSS JOIN tables AS table_state
WHERE target.rolsuper
   OR target.rolbypassrls
   OR target.oid = table_state.relowner
   OR pg_catalog.has_table_privilege(target.oid, table_state.oid, 'SELECT')
   OR pg_catalog.has_table_privilege(target.oid, table_state.oid, 'INSERT')
   OR pg_catalog.has_table_privilege(target.oid, table_state.oid, 'UPDATE')
   OR pg_catalog.has_table_privilege(target.oid, table_state.oid, 'DELETE')
ORDER BY role_name, table_name;

-- 190 — Default privileges
SELECT 'A21R_SECTION_190_DEFAULT_PRIVILEGES'::text AS section;

SELECT
    pg_catalog.pg_get_userbyid(default_state.defaclrole)::text AS owner,
    COALESCE(namespace_state.nspname::text, '<global>') AS schema_name,
    default_state.defaclobjtype::text AS object_type,
    CASE WHEN acl_state.grantee = 0 THEN 'PUBLIC'
         ELSE pg_catalog.pg_get_userbyid(acl_state.grantee)::text END AS grantee,
    CASE WHEN acl_state.grantor = 0 THEN 'PUBLIC'
         ELSE pg_catalog.pg_get_userbyid(acl_state.grantor)::text END AS grantor,
    acl_state.privilege_type::text,
    acl_state.is_grantable
FROM pg_catalog.pg_default_acl AS default_state
LEFT JOIN pg_catalog.pg_namespace AS namespace_state
  ON namespace_state.oid = default_state.defaclnamespace
CROSS JOIN LATERAL pg_catalog.unnest(
    default_state.defaclacl
) AS acl_item(value)
CROSS JOIN LATERAL pg_catalog.aclexplode(
    ARRAY[acl_item.value]::aclitem[]
) AS acl_state
ORDER BY owner, schema_name, object_type, grantee, privilege_type;

-- 200 — Role/session GUC configuration
SELECT 'A21R_SECTION_200_ROLE_SESSION_GUC'::text AS section;

WITH relevant_roles AS (
    SELECT oid, rolname FROM pg_catalog.pg_roles
    WHERE rolname IN ('afex_core_runtime', 'afex_function_owner')
       OR rolname = NULLIF(:'AFEX_TARGET_LOGIN', '')
       OR (
           NULLIF(:'AFEX_TARGET_LOGIN', '') IS NULL
           AND rolcanlogin AND NOT rolsuper AND rolname !~ '^pg_'
           AND (
               EXISTS (
                   SELECT 1 FROM pg_catalog.pg_auth_members AS membership
                   WHERE membership.member = oid
                     AND membership.roleid = pg_catalog.to_regrole(
                         'afex_core_runtime'
                     )
               )
               OR pg_catalog.pg_has_role(
                   oid, pg_catalog.to_regrole('afex_core_runtime'), 'SET'
               )
               OR EXISTS (
                   SELECT 1
                   FROM pg_catalog.pg_proc AS function_state
                   CROSS JOIN LATERAL pg_catalog.unnest(
                       function_state.proacl
                   ) AS acl_item(value)
                   CROSS JOIN LATERAL pg_catalog.aclexplode(
                       ARRAY[acl_item.value]::aclitem[]
                   ) AS acl_state
                   WHERE function_state.oid = pg_catalog.to_regprocedure(
                       'public.acquire_atomic_order_command_v1(uuid,uuid,uuid,text,text,text,text,timestamp with time zone)'
                   )
                     AND acl_state.grantee = pg_catalog.to_regrole(rolname)
                     AND acl_state.privilege_type = 'EXECUTE'
               )
           )
       )
)
SELECT
    role_state.rolname::text AS role_name,
    database_state.datname::text AS database_name,
    setting_state.setconfig,
    EXISTS (
        SELECT 1 FROM pg_catalog.unnest(setting_state.setconfig) AS setting(value)
        WHERE setting.value ~* '^(search_path|role|row_security|statement_timeout|application_name|request\.|app\.|afex\.)='
    ) AS security_relevant_setting_present
FROM relevant_roles AS role_state
JOIN pg_catalog.pg_db_role_setting AS setting_state
  ON setting_state.setrole = role_state.oid
LEFT JOIN pg_catalog.pg_database AS database_state
  ON database_state.oid = setting_state.setdatabase
ORDER BY role_name, database_name NULLS FIRST;

SELECT
    name::text AS setting_name,
    setting::text AS current_value,
    source::text AS setting_source,
    context::text AS setting_context
FROM pg_catalog.pg_settings
WHERE name IN (
    'search_path', 'row_security', 'statement_timeout',
    'lock_timeout', 'idle_in_transaction_session_timeout',
    'application_name', 'role'
)
ORDER BY setting_name;

WITH relevant_roles AS (
    SELECT oid, rolname FROM pg_catalog.pg_roles
    WHERE rolname IN ('afex_core_runtime', 'afex_function_owner')
       OR rolname = NULLIF(:'AFEX_TARGET_LOGIN', '')
       OR (
           NULLIF(:'AFEX_TARGET_LOGIN', '') IS NULL
           AND rolcanlogin AND NOT rolsuper AND rolname !~ '^pg_'
           AND (
               EXISTS (
                   SELECT 1 FROM pg_catalog.pg_auth_members AS membership
                   WHERE membership.member = oid
                     AND membership.roleid = pg_catalog.to_regrole(
                         'afex_core_runtime'
                     )
               )
               OR pg_catalog.pg_has_role(
                   oid, pg_catalog.to_regrole('afex_core_runtime'), 'SET'
               )
               OR EXISTS (
                   SELECT 1
                   FROM pg_catalog.pg_proc AS function_state
                   CROSS JOIN LATERAL pg_catalog.unnest(
                       function_state.proacl
                   ) AS acl_item(value)
                   CROSS JOIN LATERAL pg_catalog.aclexplode(
                       ARRAY[acl_item.value]::aclitem[]
                   ) AS acl_state
                   WHERE function_state.oid = pg_catalog.to_regprocedure(
                       'public.acquire_atomic_order_command_v1(uuid,uuid,uuid,text,text,text,text,timestamp with time zone)'
                   )
                     AND acl_state.grantee = pg_catalog.to_regrole(rolname)
                     AND acl_state.privilege_type = 'EXECUTE'
               )
           )
       )
),
parameters(parameter_name) AS (
    VALUES
        ('search_path'::text),
        ('row_security'),
        ('statement_timeout'),
        ('application_name')
)
SELECT
    role_state.rolname::text AS role_name,
    parameter_state.parameter_name,
    setting_state.context::text AS setting_context,
    pg_catalog.has_parameter_privilege(
        role_state.oid, parameter_state.parameter_name, 'SET'
    ) AS can_set_parameter
FROM relevant_roles AS role_state
CROSS JOIN parameters AS parameter_state
LEFT JOIN pg_catalog.pg_settings AS setting_state
  ON setting_state.name = parameter_state.parameter_name
ORDER BY role_name, parameter_name;

SELECT
    parameter_acl.parname::text AS parameter_name,
    CASE WHEN acl_state.grantee = 0 THEN 'PUBLIC'
         ELSE pg_catalog.pg_get_userbyid(acl_state.grantee)::text END AS grantee,
    CASE WHEN acl_state.grantor = 0 THEN 'PUBLIC'
         ELSE pg_catalog.pg_get_userbyid(acl_state.grantor)::text END AS grantor,
    acl_state.privilege_type::text,
    acl_state.is_grantable
FROM pg_catalog.pg_parameter_acl AS parameter_acl
CROSS JOIN LATERAL pg_catalog.unnest(
    parameter_acl.paracl
) AS acl_item(value)
CROSS JOIN LATERAL pg_catalog.aclexplode(
    ARRAY[acl_item.value]::aclitem[]
) AS acl_state
ORDER BY parameter_name, grantee, privilege_type;

-- 210 — PUBLIC privilege inheritance
SELECT 'A21R_SECTION_210_PUBLIC_PRIVILEGE_INHERITANCE'::text AS section;

WITH public_function_acl AS (
    SELECT
        function_state.oid,
        namespace_state.nspname,
        function_state.proname,
        function_state.proacl,
        acl_state.privilege_type::text AS privilege_type
    FROM pg_catalog.pg_proc AS function_state
    JOIN pg_catalog.pg_namespace AS namespace_state
      ON namespace_state.oid = function_state.pronamespace
    CROSS JOIN LATERAL pg_catalog.unnest(
        function_state.proacl
    ) AS acl_item(value)
    CROSS JOIN LATERAL pg_catalog.aclexplode(
        ARRAY[acl_item.value]::aclitem[]
    ) AS acl_state
    WHERE namespace_state.nspname = 'public'
      AND acl_state.grantee = 0
),
public_schema_acl AS (
    SELECT
        namespace_state.nspname,
        acl_state.privilege_type::text AS privilege_type
    FROM pg_catalog.pg_namespace AS namespace_state
    CROSS JOIN LATERAL pg_catalog.unnest(
        namespace_state.nspacl
    ) AS acl_item(value)
    CROSS JOIN LATERAL pg_catalog.aclexplode(
        ARRAY[acl_item.value]::aclitem[]
    ) AS acl_state
    WHERE acl_state.grantee = 0
),
public_relation_acl AS (
    SELECT
        namespace_state.nspname,
        relation_state.relname,
        relation_state.relkind,
        acl_state.privilege_type::text AS privilege_type
    FROM pg_catalog.pg_class AS relation_state
    JOIN pg_catalog.pg_namespace AS namespace_state
      ON namespace_state.oid = relation_state.relnamespace
    CROSS JOIN LATERAL pg_catalog.unnest(
        relation_state.relacl
    ) AS acl_item(value)
    CROSS JOIN LATERAL pg_catalog.aclexplode(
        ARRAY[acl_item.value]::aclitem[]
    ) AS acl_state
    WHERE namespace_state.nspname = 'public'
      AND relation_state.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND acl_state.grantee = 0
)
SELECT
    'FUNCTION'::text AS object_type,
    namespace_state.nspname::text AS schema_name,
    function_state.proname::text AS object_name,
    pg_catalog.pg_get_function_identity_arguments(function_state.oid)::text
        AS identity,
    'EXECUTE'::text AS privilege_type,
    true AS implicit_default
FROM pg_catalog.pg_proc AS function_state
JOIN pg_catalog.pg_namespace AS namespace_state
  ON namespace_state.oid = function_state.pronamespace
WHERE namespace_state.nspname = 'public'
  AND function_state.proacl IS NULL
UNION ALL
SELECT
    'FUNCTION', function_acl.nspname::text,
    function_acl.proname::text,
    pg_catalog.pg_get_function_identity_arguments(function_acl.oid)::text,
    function_acl.privilege_type, false
FROM public_function_acl AS function_acl
UNION ALL
SELECT
    'SCHEMA', schema_acl.nspname::text,
    schema_acl.nspname::text, NULL::text,
    schema_acl.privilege_type, false
FROM public_schema_acl AS schema_acl
UNION ALL
SELECT
    'RELATION', relation_acl.nspname::text,
    relation_acl.relname::text, relation_acl.relkind::text,
    relation_acl.privilege_type, false
FROM public_relation_acl AS relation_acl
ORDER BY object_type, schema_name, object_name, privilege_type;

-- 220 — afex_function_owner-owned object exposure
SELECT 'A21R_SECTION_220_FUNCTION_OWNER_OBJECT_EXPOSURE'::text AS section;

SELECT
    'FUNCTION'::text AS object_type,
    namespace_state.nspname::text AS schema_name,
    function_state.proname::text AS object_name,
    pg_catalog.pg_get_function_identity_arguments(function_state.oid)::text
        AS identity,
    function_state.prosecdef AS security_definer,
    function_state.proconfig,
    function_state.proacl::text AS direct_acl_text
FROM pg_catalog.pg_proc AS function_state
JOIN pg_catalog.pg_namespace AS namespace_state
  ON namespace_state.oid = function_state.pronamespace
WHERE function_state.proowner = pg_catalog.to_regrole('afex_function_owner')
UNION ALL
SELECT
    'RELATION', namespace_state.nspname::text,
    relation_state.relname::text, relation_state.relkind::text,
    false, NULL::text[], relation_state.relacl::text
FROM pg_catalog.pg_class AS relation_state
JOIN pg_catalog.pg_namespace AS namespace_state
  ON namespace_state.oid = relation_state.relnamespace
WHERE relation_state.relowner = pg_catalog.to_regrole('afex_function_owner')
ORDER BY object_type, schema_name, object_name;

-- 230 — Legacy write-function exposure
SELECT 'A21R_SECTION_230_LEGACY_WRITE_FUNCTION_EXPOSURE'::text AS section;

WITH targets AS (
    SELECT oid, rolname FROM pg_catalog.pg_roles
    WHERE rolname = 'afex_core_runtime'
       OR rolname = NULLIF(:'AFEX_TARGET_LOGIN', '')
       OR (
           NULLIF(:'AFEX_TARGET_LOGIN', '') IS NULL
           AND rolcanlogin AND NOT rolsuper AND rolname !~ '^pg_'
           AND (
               EXISTS (
                   SELECT 1 FROM pg_catalog.pg_auth_members AS membership
                   WHERE membership.member = oid
                     AND membership.roleid = pg_catalog.to_regrole(
                         'afex_core_runtime'
                     )
               )
               OR pg_catalog.pg_has_role(
                   oid, pg_catalog.to_regrole('afex_core_runtime'), 'SET'
               )
               OR EXISTS (
                   SELECT 1
                   FROM pg_catalog.pg_proc AS function_state
                   CROSS JOIN LATERAL pg_catalog.unnest(
                       function_state.proacl
                   ) AS acl_item(value)
                   CROSS JOIN LATERAL pg_catalog.aclexplode(
                       ARRAY[acl_item.value]::aclitem[]
                   ) AS acl_state
                   WHERE function_state.oid = pg_catalog.to_regprocedure(
                       'public.acquire_atomic_order_command_v1(uuid,uuid,uuid,text,text,text,text,timestamp with time zone)'
                   )
                     AND acl_state.grantee = pg_catalog.to_regrole(rolname)
                     AND acl_state.privilege_type = 'EXECUTE'
               )
           )
       )
)
SELECT
    target.rolname::text AS role_name,
    namespace_state.nspname::text AS schema_name,
    function_state.proname::text AS function_name,
    pg_catalog.pg_get_function_identity_arguments(function_state.oid)::text
        AS identity_arguments,
    pg_catalog.pg_get_userbyid(function_state.proowner)::text AS owner,
    function_state.prosecdef AS security_definer,
    pg_catalog.has_function_privilege(
        target.oid, function_state.oid, 'EXECUTE'
    ) AS effective_execute,
    'NAME_HEURISTIC_REQUIRES_REVIEW'::text AS classification_limit
FROM targets AS target
CROSS JOIN pg_catalog.pg_proc AS function_state
JOIN pg_catalog.pg_namespace AS namespace_state
  ON namespace_state.oid = function_state.pronamespace
WHERE namespace_state.nspname !~ '^pg_'
  AND namespace_state.nspname <> 'information_schema'
  AND function_state.proname ~* '(create|insert|update|delete|cancel|restore|issue|execute|order|invoice|payment|inventory|support|tenant|user|pin)'
  AND function_state.proname <> 'acquire_atomic_order_command_v1'
  AND pg_catalog.has_function_privilege(
      target.oid, function_state.oid, 'EXECUTE'
  )
ORDER BY role_name, function_name, identity_arguments;

-- 240 — Runtime ledger/outbox direct-access check
SELECT 'A21R_SECTION_240_RUNTIME_LEDGER_OUTBOX_ACCESS'::text AS section;

WITH targets AS (
    SELECT oid, rolname FROM pg_catalog.pg_roles
    WHERE rolname = 'afex_core_runtime'
       OR rolname = NULLIF(:'AFEX_TARGET_LOGIN', '')
       OR (
           NULLIF(:'AFEX_TARGET_LOGIN', '') IS NULL
           AND rolcanlogin AND NOT rolsuper AND rolname !~ '^pg_'
           AND (
               EXISTS (
                   SELECT 1 FROM pg_catalog.pg_auth_members AS membership
                   WHERE membership.member = oid
                     AND membership.roleid = pg_catalog.to_regrole(
                         'afex_core_runtime'
                     )
               )
               OR pg_catalog.pg_has_role(
                   oid, pg_catalog.to_regrole('afex_core_runtime'), 'SET'
               )
               OR EXISTS (
                   SELECT 1
                   FROM pg_catalog.pg_proc AS function_state
                   CROSS JOIN LATERAL pg_catalog.unnest(
                       function_state.proacl
                   ) AS acl_item(value)
                   CROSS JOIN LATERAL pg_catalog.aclexplode(
                       ARRAY[acl_item.value]::aclitem[]
                   ) AS acl_state
                   WHERE function_state.oid = pg_catalog.to_regprocedure(
                       'public.acquire_atomic_order_command_v1(uuid,uuid,uuid,text,text,text,text,timestamp with time zone)'
                   )
                     AND acl_state.grantee = pg_catalog.to_regrole(rolname)
                     AND acl_state.privilege_type = 'EXECUTE'
               )
           )
       )
),
objects AS (
    SELECT relation_state.*, namespace_state.nspname
    FROM pg_catalog.pg_class AS relation_state
    JOIN pg_catalog.pg_namespace AS namespace_state
      ON namespace_state.oid = relation_state.relnamespace
    WHERE relation_state.relkind IN ('r', 'p', 'v', 'm', 'S')
      AND (
          relation_state.relname IN (
              'atomic_authorization_contexts', 'atomic_order_commands',
              'atomic_order_command_payloads'
          )
          OR relation_state.relname ~* '(outbox|ledger)'
      )
),
privileges(privilege_type) AS (
    VALUES ('SELECT'::text), ('INSERT'), ('UPDATE'), ('DELETE'),
           ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')
)
SELECT
    target.rolname::text AS role_name,
    object_state.nspname::text AS schema_name,
    object_state.relname::text AS object_name,
    object_state.relkind::text AS object_kind,
    privilege.privilege_type,
    CASE WHEN object_state.relkind = 'S' THEN
        pg_catalog.has_sequence_privilege(
            target.oid, object_state.oid, privilege.privilege_type
        )
    ELSE
        pg_catalog.has_table_privilege(
            target.oid, object_state.oid, privilege.privilege_type
        )
    END AS effective_privilege
FROM targets AS target
CROSS JOIN objects AS object_state
CROSS JOIN privileges AS privilege
WHERE object_state.relkind <> 'S'
  AND pg_catalog.has_table_privilege(
      target.oid, object_state.oid, privilege.privilege_type
  )
ORDER BY role_name, schema_name, object_name, privilege_type;

-- 250 — Privilege-contract summary
SELECT 'A21R_SECTION_250_PRIVILEGE_CONTRACT_SUMMARY'::text AS section;

WITH runtime AS (
    SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'afex_core_runtime'
),
targets AS (
    SELECT role_state.* FROM pg_catalog.pg_roles AS role_state
    WHERE (
        NULLIF(:'AFEX_TARGET_LOGIN', '') IS NOT NULL
        AND role_state.rolname = NULLIF(:'AFEX_TARGET_LOGIN', '')
    ) OR (
        NULLIF(:'AFEX_TARGET_LOGIN', '') IS NULL
        AND role_state.rolcanlogin
        AND NOT role_state.rolsuper
        AND role_state.rolname !~ '^pg_'
        AND role_state.rolname <> 'postgres'
           AND (
               EXISTS (
                   SELECT 1 FROM pg_catalog.pg_auth_members AS membership
                   WHERE membership.member = oid
                     AND membership.roleid = pg_catalog.to_regrole(
                         'afex_core_runtime'
                     )
               )
               OR pg_catalog.pg_has_role(
                role_state.oid, (SELECT oid FROM runtime), 'SET'
            )
            OR EXISTS (
                SELECT 1
                FROM pg_catalog.pg_proc AS function_state
                CROSS JOIN LATERAL pg_catalog.unnest(
                    function_state.proacl
                ) AS acl_item(value)
                CROSS JOIN LATERAL pg_catalog.aclexplode(
                    ARRAY[acl_item.value]::aclitem[]
                ) AS acl_state
                WHERE function_state.oid = pg_catalog.to_regprocedure(
                    'public.acquire_atomic_order_command_v1(uuid,uuid,uuid,text,text,text,text,timestamp with time zone)'
                )
                  AND acl_state.grantee = role_state.oid
                  AND acl_state.privilege_type = 'EXECUTE'
            )
        )
    )
),
facts AS (
    SELECT
        (SELECT pg_catalog.count(*) FROM targets) AS candidate_count,
        COALESCE(pg_catalog.bool_and(
            NOT target.rolsuper
            AND NOT target.rolinherit
            AND NOT target.rolcreatedb
            AND NOT target.rolcreaterole
            AND NOT target.rolreplication
            AND NOT target.rolbypassrls
        ), false) AS login_attributes_safe,
        COALESCE(pg_catalog.bool_and((
            SELECT pg_catalog.count(*) = 1
               AND pg_catalog.bool_and(
                   membership.roleid = (SELECT oid FROM runtime)
                   AND NOT membership.admin_option
                   AND NOT membership.inherit_option
                   AND membership.set_option
               )
            FROM pg_catalog.pg_auth_members AS membership
            WHERE membership.member = target.oid
        )), false) AS membership_contract_safe,
        COALESCE(pg_catalog.bool_and(
            pg_catalog.pg_has_role(
                target.oid, (SELECT oid FROM runtime), 'SET'
            )
        ), false) AS runtime_set_role_available
    FROM targets AS target
)
SELECT
    candidate_count,
    login_attributes_safe,
    membership_contract_safe,
    runtime_set_role_available,
    pg_catalog.to_regrole('afex_core_runtime') IS NOT NULL
        AS runtime_role_exists,
    pg_catalog.to_regprocedure(
        'public.acquire_atomic_order_command_v1(uuid,uuid,uuid,text,text,text,text,timestamp with time zone)'
    ) IS NOT NULL AS p2d20_exists,
    CASE WHEN pg_catalog.to_regrole('afex_core_runtime') IS NULL THEN false
         ELSE pg_catalog.has_function_privilege(
             'afex_core_runtime',
             'public.acquire_atomic_order_command_v1(uuid,uuid,uuid,text,text,text,text,timestamp with time zone)',
             'EXECUTE'
         ) END AS runtime_can_execute_p2d20,
    'POOL_CONFIGURATION_NOT_PROVABLE_FROM_DATABASE_CATALOGS'::text
        AS pooling_evidence
FROM facts;

-- 250B — Preliminary detail inputs retained for evidence comparison
SELECT 'A21R_DETAIL_250_PRELIMINARY_CLASSIFICATION_INPUTS'::text AS section;

WITH runtime AS (
    SELECT oid, rolsuper, rolbypassrls
    FROM pg_catalog.pg_roles WHERE rolname = 'afex_core_runtime'
),
p2d20 AS (
    SELECT pg_catalog.to_regprocedure(
        'public.acquire_atomic_order_command_v1(uuid,uuid,uuid,text,text,text,text,timestamp with time zone)'
    ) AS oid
),
targets AS (
    SELECT role_state.* FROM pg_catalog.pg_roles AS role_state
    WHERE (
        NULLIF(:'AFEX_TARGET_LOGIN', '') IS NOT NULL
        AND role_state.rolname = NULLIF(:'AFEX_TARGET_LOGIN', '')
    ) OR (
        NULLIF(:'AFEX_TARGET_LOGIN', '') IS NULL
        AND role_state.rolcanlogin
        AND NOT role_state.rolsuper
        AND role_state.rolname !~ '^pg_'
        AND role_state.rolname <> 'postgres'
           AND (
               EXISTS (
                   SELECT 1 FROM pg_catalog.pg_auth_members AS membership
                   WHERE membership.member = oid
                     AND membership.roleid = pg_catalog.to_regrole(
                         'afex_core_runtime'
                     )
               )
               OR pg_catalog.pg_has_role(
                role_state.oid, (SELECT oid FROM runtime), 'SET'
            )
            OR EXISTS (
                SELECT 1
                FROM pg_catalog.pg_proc AS function_state
                CROSS JOIN LATERAL pg_catalog.unnest(
                    function_state.proacl
                ) AS acl_item(value)
                CROSS JOIN LATERAL pg_catalog.aclexplode(
                    ARRAY[acl_item.value]::aclitem[]
                ) AS acl_state
                WHERE function_state.oid = (SELECT oid FROM p2d20)
                  AND acl_state.grantee = role_state.oid
                  AND acl_state.privilege_type = 'EXECUTE'
            )
        )
    )
),
assessed_roles AS (
    SELECT oid, rolname FROM targets
    UNION
    SELECT oid, 'afex_core_runtime'::name FROM runtime
),
unsafe_role_graph AS (
    SELECT 1
    FROM targets AS target
    CROSS JOIN pg_catalog.pg_roles AS candidate
    WHERE candidate.oid <> target.oid
      AND candidate.oid <> (SELECT oid FROM runtime)
      AND pg_catalog.pg_has_role(target.oid, candidate.oid, 'SET')
    LIMIT 1
),
unsafe_membership AS (
    SELECT 1 FROM targets AS target
    WHERE (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_auth_members AS membership
        WHERE membership.member = target.oid
    ) <> 1
    OR NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_auth_members AS membership
        WHERE membership.member = target.oid
          AND membership.roleid = (SELECT oid FROM runtime)
          AND NOT membership.admin_option
          AND NOT membership.inherit_option
          AND membership.set_option
    )
    LIMIT 1
),
unsafe_objects AS (
    SELECT 1
    FROM assessed_roles AS target
    CROSS JOIN pg_catalog.pg_class AS relation_state
    JOIN pg_catalog.pg_namespace AS namespace_state
      ON namespace_state.oid = relation_state.relnamespace
    WHERE namespace_state.nspname !~ '^pg_'
      AND namespace_state.nspname <> 'information_schema'
      AND relation_state.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
      AND (
          target.oid = relation_state.relowner
          OR (
              relation_state.relkind = 'S'
              AND (
                  pg_catalog.has_sequence_privilege(
                      target.oid, relation_state.oid, 'USAGE'
                  )
                  OR pg_catalog.has_sequence_privilege(
                      target.oid, relation_state.oid, 'SELECT'
                  )
                  OR pg_catalog.has_sequence_privilege(
                      target.oid, relation_state.oid, 'UPDATE'
                  )
              )
          )
          OR (
              relation_state.relkind <> 'S'
              AND (
                  pg_catalog.has_table_privilege(
                      target.oid, relation_state.oid, 'SELECT'
                  )
                  OR pg_catalog.has_table_privilege(
                      target.oid, relation_state.oid, 'INSERT'
                  )
                  OR pg_catalog.has_table_privilege(
                      target.oid, relation_state.oid, 'UPDATE'
                  )
                  OR pg_catalog.has_table_privilege(
                      target.oid, relation_state.oid, 'DELETE'
                  )
              )
          )
      )
    LIMIT 1
),
unsafe_schema AS (
    SELECT 1
    FROM assessed_roles AS target
    CROSS JOIN pg_catalog.pg_namespace AS namespace_state
    WHERE pg_catalog.has_schema_privilege(
        target.oid, namespace_state.oid, 'CREATE'
    )
    LIMIT 1
),
unsafe_execute AS (
    SELECT 1
    FROM assessed_roles AS target
    CROSS JOIN pg_catalog.pg_proc AS function_state
    JOIN pg_catalog.pg_namespace AS namespace_state
      ON namespace_state.oid = function_state.pronamespace
    WHERE namespace_state.nspname !~ '^pg_'
      AND namespace_state.nspname <> 'information_schema'
      AND function_state.oid IS DISTINCT FROM (SELECT oid FROM p2d20)
      AND pg_catalog.has_function_privilege(
          target.oid, function_state.oid, 'EXECUTE'
      )
    LIMIT 1
),
facts AS (
    SELECT
        (SELECT pg_catalog.count(*) FROM targets) AS candidate_count,
        EXISTS (
            SELECT 1 FROM targets
            WHERE rolsuper OR rolbypassrls
        ) OR COALESCE((SELECT rolsuper OR rolbypassrls FROM runtime), true)
            AS rls_bypass,
        EXISTS (SELECT 1 FROM unsafe_role_graph)
            OR EXISTS (SELECT 1 FROM unsafe_membership) AS role_graph_unsafe,
        EXISTS (SELECT 1 FROM unsafe_objects)
            OR EXISTS (SELECT 1 FROM unsafe_schema) AS direct_object_unsafe,
        EXISTS (SELECT 1 FROM unsafe_execute) AS execute_surface_broad,
        EXISTS (
            SELECT 1 FROM targets
            WHERE rolinherit OR rolcreatedb OR rolcreaterole OR rolreplication
        ) AS closure_required,
        (SELECT oid FROM runtime) IS NOT NULL AS runtime_exists,
        (SELECT oid FROM p2d20) IS NOT NULL AS p2d20_exists,
        CASE WHEN (SELECT oid FROM p2d20) IS NULL
                  OR (SELECT oid FROM runtime) IS NULL THEN false
             ELSE pg_catalog.has_function_privilege(
                 'afex_core_runtime', (SELECT oid FROM p2d20), 'EXECUTE'
             ) END AS runtime_p2d20_execute
)
SELECT
    CASE
        WHEN NOT runtime_exists OR NOT p2d20_exists
            THEN 'INSUFFICIENT_EVIDENCE'
        WHEN candidate_count = 0 THEN 'LOGIN_MISSING'
        WHEN candidate_count > 1 THEN 'MULTIPLE_AMBIGUOUS_LOGIN_CANDIDATES'
        WHEN rls_bypass THEN 'RLS_BYPASS_RISK'
        WHEN role_graph_unsafe THEN 'ROLE_GRAPH_UNSAFE'
        WHEN direct_object_unsafe THEN 'DIRECT_OBJECT_ACCESS_UNSAFE'
        WHEN execute_surface_broad OR NOT runtime_p2d20_execute
            THEN 'EXECUTE_SURFACE_TOO_BROAD'
        WHEN closure_required THEN 'READY_WITH_CLOSURE_REQUIRED'
        ELSE 'POOLING_MODEL_UNRESOLVED'
    END::text AS preliminary_classification,
    candidate_count,
    rls_bypass,
    role_graph_unsafe,
    direct_object_unsafe,
    execute_surface_broad,
    closure_required,
    runtime_p2d20_execute,
    'READY_AS_DESIGNED requires separately reviewed pool/session-reset evidence'::text
        AS classification_note
FROM facts;

-- 260 — Authoritative decision classification
SELECT 'A21R_SECTION_260_DECISION_CLASSIFICATION'::text AS section;

WITH
runtime AS (
    SELECT * FROM pg_catalog.pg_roles WHERE rolname = 'afex_core_runtime'
),
p2d20 AS (
    SELECT pg_catalog.to_regprocedure(
        'public.acquire_atomic_order_command_v1(uuid,uuid,uuid,text,text,text,text,timestamp with time zone)'
    ) AS oid
),
p2d20_direct_execute AS (
    SELECT acl_state.grantee
    FROM pg_catalog.pg_proc AS function_state
    CROSS JOIN LATERAL pg_catalog.unnest(function_state.proacl) AS acl_item(value)
    CROSS JOIN LATERAL pg_catalog.aclexplode(
        ARRAY[acl_item.value]::aclitem[]
    ) AS acl_state
    WHERE function_state.oid = (SELECT oid FROM p2d20)
      AND acl_state.privilege_type = 'EXECUTE'
),
canonical_candidates AS (
    SELECT role_state.*
    FROM pg_catalog.pg_roles AS role_state
    WHERE (
        NULLIF(:'AFEX_TARGET_LOGIN', '') IS NOT NULL
        AND role_state.rolname = NULLIF(:'AFEX_TARGET_LOGIN', '')
    ) OR (
        NULLIF(:'AFEX_TARGET_LOGIN', '') IS NULL
        AND role_state.rolcanlogin
        AND NOT role_state.rolsuper
        AND role_state.rolname !~ '^pg_'
        AND role_state.rolname <> 'postgres'
        AND (
            EXISTS (
                SELECT 1 FROM pg_catalog.pg_auth_members AS membership
                WHERE membership.member = role_state.oid
                  AND membership.roleid = (SELECT oid FROM runtime)
            )
            OR pg_catalog.pg_has_role(
                role_state.oid, (SELECT oid FROM runtime), 'SET'
            )
            OR EXISTS (
                SELECT 1 FROM p2d20_direct_execute AS direct_execute
                WHERE direct_execute.grantee = role_state.oid
            )
        )
    )
),
section_020_candidates AS (SELECT * FROM canonical_candidates),
section_250_candidates AS (SELECT * FROM canonical_candidates),
section_260_candidates AS (SELECT * FROM canonical_candidates),
assessed_candidates AS (SELECT * FROM canonical_candidates),
assessed_roles AS (
    SELECT oid, rolname, 'PRE_SET_TARGET'::text AS role_state
    FROM assessed_candidates
    UNION ALL
    SELECT oid, rolname, 'POST_SET_RUNTIME'::text FROM runtime
),
relevant_namespaces AS (
    SELECT * FROM pg_catalog.pg_namespace
    WHERE nspname !~ '^pg_' AND nspname <> 'information_schema'
),
relevant_relations AS (
    SELECT relation_state.*, namespace_state.nspname
    FROM pg_catalog.pg_class AS relation_state
    JOIN relevant_namespaces AS namespace_state
      ON namespace_state.oid = relation_state.relnamespace
    WHERE relation_state.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
),
relevant_functions AS (
    SELECT function_state.*, namespace_state.nspname
    FROM pg_catalog.pg_proc AS function_state
    JOIN relevant_namespaces AS namespace_state
      ON namespace_state.oid = function_state.pronamespace
),
unsafe_role_graph AS (
    SELECT 1
    FROM assessed_candidates AS target
    CROSS JOIN pg_catalog.pg_roles AS candidate
    WHERE candidate.oid <> target.oid
      AND candidate.oid <> (SELECT oid FROM runtime)
      AND pg_catalog.pg_has_role(target.oid, candidate.oid, 'SET')
    LIMIT 1
),
unsafe_membership AS (
    SELECT 1 FROM assessed_candidates AS target
    WHERE (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_auth_members AS membership
        WHERE membership.member = target.oid
    ) <> 1
       OR NOT EXISTS (
           SELECT 1 FROM pg_catalog.pg_auth_members AS membership
           WHERE membership.member = target.oid
             AND membership.roleid = (SELECT oid FROM runtime)
             AND NOT membership.admin_option
             AND NOT membership.inherit_option
             AND membership.set_option
       )
    LIMIT 1
),
unsafe_relation_access AS (
    SELECT 1
    FROM assessed_roles AS target
    CROSS JOIN relevant_relations AS relation_state
    WHERE target.oid = relation_state.relowner
       OR (
           relation_state.relkind = 'S'
           AND (
               pg_catalog.has_sequence_privilege(target.oid, relation_state.oid, 'USAGE')
               OR pg_catalog.has_sequence_privilege(target.oid, relation_state.oid, 'SELECT')
               OR pg_catalog.has_sequence_privilege(target.oid, relation_state.oid, 'UPDATE')
           )
       )
       OR (
           relation_state.relkind <> 'S'
           AND (
               pg_catalog.has_table_privilege(target.oid, relation_state.oid, 'SELECT')
               OR pg_catalog.has_table_privilege(target.oid, relation_state.oid, 'INSERT')
               OR pg_catalog.has_table_privilege(target.oid, relation_state.oid, 'UPDATE')
               OR pg_catalog.has_table_privilege(target.oid, relation_state.oid, 'DELETE')
               OR pg_catalog.has_table_privilege(target.oid, relation_state.oid, 'TRUNCATE')
               OR pg_catalog.has_table_privilege(target.oid, relation_state.oid, 'REFERENCES')
               OR pg_catalog.has_table_privilege(target.oid, relation_state.oid, 'TRIGGER')
               OR EXISTS (
                   SELECT 1 FROM pg_catalog.pg_attribute AS attribute_state
                   WHERE attribute_state.attrelid = relation_state.oid
                     AND attribute_state.attnum > 0
                     AND NOT attribute_state.attisdropped
                     AND (
                         pg_catalog.has_column_privilege(
                             target.oid, relation_state.oid,
                             attribute_state.attnum, 'SELECT'
                         )
                         OR pg_catalog.has_column_privilege(
                             target.oid, relation_state.oid,
                             attribute_state.attnum, 'INSERT'
                         )
                         OR pg_catalog.has_column_privilege(
                             target.oid, relation_state.oid,
                             attribute_state.attnum, 'UPDATE'
                         )
                         OR pg_catalog.has_column_privilege(
                             target.oid, relation_state.oid,
                             attribute_state.attnum, 'REFERENCES'
                         )
                     )
               )
           )
       )
    LIMIT 1
),
unsafe_schema_access AS (
    SELECT 1
    FROM assessed_roles AS target
    CROSS JOIN relevant_namespaces AS namespace_state
    WHERE pg_catalog.has_schema_privilege(target.oid, namespace_state.oid, 'CREATE')
       OR (
           namespace_state.nspname <> 'public'
           AND pg_catalog.has_schema_privilege(target.oid, namespace_state.oid, 'USAGE')
           AND (
               EXISTS (
                   SELECT 1 FROM relevant_functions AS function_state
                   WHERE function_state.pronamespace = namespace_state.oid
                     AND pg_catalog.has_function_privilege(
                         target.oid, function_state.oid, 'EXECUTE'
                     )
               )
               OR EXISTS (
                   SELECT 1 FROM relevant_relations AS relation_state
                   WHERE relation_state.relnamespace = namespace_state.oid
                     AND (
                         relation_state.relkind = 'S'
                         AND pg_catalog.has_sequence_privilege(
                             target.oid, relation_state.oid, 'USAGE'
                         )
                         OR relation_state.relkind <> 'S'
                         AND pg_catalog.has_table_privilege(
                             target.oid, relation_state.oid, 'SELECT'
                         )
                     )
               )
           )
       )
    LIMIT 1
),
unsafe_default_privileges AS (
    SELECT 1
    FROM pg_catalog.pg_default_acl AS default_state
    CROSS JOIN LATERAL pg_catalog.unnest(default_state.defaclacl) AS acl_item(value)
    CROSS JOIN LATERAL pg_catalog.aclexplode(
        ARRAY[acl_item.value]::aclitem[]
    ) AS acl_state
    WHERE acl_state.grantee = 0
       OR (
           acl_state.grantee <> 0
           AND EXISTS (
               SELECT 1 FROM assessed_roles AS target
               WHERE acl_state.grantee = target.oid
                  OR pg_catalog.pg_has_role(
                      target.oid, acl_state.grantee, 'USAGE'
                  )
           )
       )
    LIMIT 1
),
unsafe_execute AS (
    SELECT 1
    FROM assessed_roles AS target
    CROSS JOIN relevant_functions AS function_state
    WHERE pg_catalog.has_function_privilege(target.oid, function_state.oid, 'EXECUTE')
      AND (
          target.role_state = 'PRE_SET_TARGET'
          OR function_state.oid IS DISTINCT FROM (SELECT oid FROM p2d20)
      )
    LIMIT 1
),
missing_runtime_execute AS (
    SELECT 1
    WHERE CASE
        WHEN (SELECT oid FROM runtime) IS NULL
          OR (SELECT oid FROM p2d20) IS NULL THEN true
        ELSE NOT pg_catalog.has_function_privilege(
            (SELECT oid FROM runtime), (SELECT oid FROM p2d20), 'EXECUTE'
        )
    END
),
rls_bypass AS (
    SELECT 1
    FROM assessed_roles AS target
    WHERE EXISTS (
        SELECT 1 FROM pg_catalog.pg_roles AS role_state
        WHERE role_state.oid = target.oid
          AND (role_state.rolsuper OR role_state.rolbypassrls)
    )
    OR EXISTS (
        SELECT 1 FROM relevant_relations AS relation_state
        WHERE relation_state.relkind IN ('r', 'p')
          AND relation_state.relrowsecurity
          AND NOT relation_state.relforcerowsecurity
          AND (
              target.oid = relation_state.relowner
              OR pg_catalog.pg_has_role(target.oid, relation_state.relowner, 'SET')
          )
    )
    OR EXISTS (
        SELECT 1
        FROM relevant_functions AS function_state
        JOIN pg_catalog.pg_roles AS function_owner
          ON function_owner.oid = function_state.proowner
        WHERE function_state.prosecdef
          AND function_state.oid IS DISTINCT FROM (SELECT oid FROM p2d20)
          AND pg_catalog.has_function_privilege(
              target.oid, function_state.oid, 'EXECUTE'
          )
          AND (
              function_owner.rolsuper OR function_owner.rolbypassrls
              OR EXISTS (
                  SELECT 1 FROM relevant_relations AS relation_state
                  WHERE relation_state.relkind IN ('r', 'p')
                    AND relation_state.relrowsecurity
                    AND NOT relation_state.relforcerowsecurity
                    AND relation_state.relowner = function_owner.oid
              )
          )
    )
    LIMIT 1
),
consistency AS (
    SELECT
        (SELECT pg_catalog.count(*) FROM section_020_candidates)
            AS section_020_candidate_count,
        (SELECT pg_catalog.count(*) FROM section_250_candidates)
            AS section_250_candidate_count,
        (SELECT pg_catalog.count(*) FROM section_260_candidates)
            AS section_260_candidate_count,
        (SELECT pg_catalog.count(*) FROM assessed_candidates)
            AS assessed_candidate_count,
        CASE WHEN NULLIF(:'AFEX_TARGET_LOGIN', '') IS NULL THEN true
             ELSE EXISTS (
                 SELECT 1 FROM canonical_candidates
                 WHERE rolname = NULLIF(:'AFEX_TARGET_LOGIN', '')
             ) END AS explicit_target_found,
        NOT EXISTS (
            SELECT oid FROM canonical_candidates
            EXCEPT
            SELECT oid FROM assessed_candidates
        ) AS discovery_candidates_fully_assessed
),
facts AS (
    SELECT
        consistency.*,
        section_020_candidate_count = section_250_candidate_count
        AND section_250_candidate_count = section_260_candidate_count
        AND section_260_candidate_count = assessed_candidate_count
            AS candidate_counts_match,
        (SELECT oid FROM runtime) IS NOT NULL AS runtime_exists,
        (SELECT oid FROM p2d20) IS NOT NULL AS p2d20_exists,
        EXISTS (SELECT 1 FROM rls_bypass) AS rls_bypass_risk,
        EXISTS (SELECT 1 FROM unsafe_role_graph)
        OR EXISTS (SELECT 1 FROM unsafe_membership) AS role_graph_unsafe,
        EXISTS (SELECT 1 FROM unsafe_relation_access)
        OR EXISTS (SELECT 1 FROM unsafe_schema_access)
        OR EXISTS (SELECT 1 FROM unsafe_default_privileges)
            AS direct_object_access_unsafe,
        EXISTS (SELECT 1 FROM unsafe_execute)
        OR EXISTS (SELECT 1 FROM missing_runtime_execute)
            AS execute_surface_too_broad,
        EXISTS (
            SELECT 1 FROM assessed_candidates
            WHERE NOT rolcanlogin OR rolinherit OR rolcreatedb OR rolcreaterole
               OR rolreplication OR rolconnlimit <> 1
        ) AS closure_required,
        false AS pool_evidence_proven
    FROM consistency
)
SELECT
    section_020_candidate_count,
    section_250_candidate_count,
    section_260_candidate_count,
    assessed_candidate_count,
    candidate_counts_match,
    explicit_target_found,
    discovery_candidates_fully_assessed,
    rls_bypass_risk,
    role_graph_unsafe,
    direct_object_access_unsafe,
    execute_surface_too_broad,
    closure_required,
    pool_evidence_proven,
    CASE
        WHEN NOT runtime_exists OR NOT p2d20_exists
          OR NOT candidate_counts_match
          OR NOT discovery_candidates_fully_assessed
            THEN 'INSUFFICIENT_EVIDENCE'
        WHEN section_260_candidate_count = 0 THEN 'LOGIN_MISSING'
        WHEN section_260_candidate_count > 1
            THEN 'MULTIPLE_AMBIGUOUS_LOGIN_CANDIDATES'
        WHEN rls_bypass_risk THEN 'RLS_BYPASS_RISK'
        WHEN role_graph_unsafe THEN 'ROLE_GRAPH_UNSAFE'
        WHEN direct_object_access_unsafe THEN 'DIRECT_OBJECT_ACCESS_UNSAFE'
        WHEN execute_surface_too_broad THEN 'EXECUTE_SURFACE_TOO_BROAD'
        WHEN closure_required THEN 'READY_WITH_CLOSURE_REQUIRED'
        WHEN NOT pool_evidence_proven THEN 'POOLING_MODEL_UNRESOLVED'
        ELSE 'READY_AS_DESIGNED'
    END::text AS final_classification,
    'READY_AS_DESIGNED requires separately reviewed pool/session-reset evidence'::text
        AS classification_note
FROM facts;

-- 900 — Completion marker
SELECT 'A21R_900_RUNTIME_PRIVILEGE_DIAGNOSTIC_COMPLETE'::text AS final_marker;

ROLLBACK;
