\if :{?AFEX_EXPECTED_DATABASE}
\else
\echo 'P2D.21K failed: AFEX_EXPECTED_DATABASE is required'
\quit 3
\endif
\if :{?AFEX_EXPECTED_USER}
\else
\echo 'P2D.21K failed: AFEX_EXPECTED_USER is required'
\quit 3
\endif

SELECT
    pg_catalog.current_database() = :'AFEX_EXPECTED_DATABASE'
        AS p2d21k_database_matches,
    CURRENT_USER::text = :'AFEX_EXPECTED_USER'
        AS p2d21k_user_matches
\gset

\if :p2d21k_database_matches
\else
\echo 'P2D.21K failed: database identity mismatch'
\quit 3
\endif
\if :p2d21k_user_matches
\else
\echo 'P2D.21K failed: installer identity mismatch'
\quit 3
\endif

BEGIN TRANSACTION READ ONLY;

-- AFEX Core V2 P2D.21K - Read-Only Installer Authority Diagnostic
-- Diagnostic only: no SET ROLE, DDL, repair, temporary object, or mutation.

SELECT
    'environment_identity'::text AS section,
    'current_user'::text AS predicate,
    'PASS'::text AS result,
    CURRENT_USER::text AS actual,
    :'AFEX_EXPECTED_USER'::text AS expected,
    'Connected effective database role.'::text AS detail
UNION ALL
SELECT
    'environment_identity',
    'session_user',
    'PASS',
    SESSION_USER::text,
    'recorded',
    'Authenticated session role; may differ from current_user after SET ROLE.'
UNION ALL
SELECT
    'environment_identity',
    'database',
    CASE
        WHEN pg_catalog.current_database() = :'AFEX_EXPECTED_DATABASE'
            THEN 'PASS'
        ELSE 'FAIL'
    END,
    pg_catalog.current_database(),
    :'AFEX_EXPECTED_DATABASE',
    'Separately approved database identity.'
ORDER BY predicate;

SELECT
    'current_role_attributes'::text AS section,
    attribute_state.attribute_name AS predicate,
    CASE
        WHEN attribute_state.actual_value IS NOT DISTINCT FROM
             attribute_state.expected_value
            THEN 'PASS'
        ELSE 'FAIL'
    END AS result,
    attribute_state.actual_value::text AS actual,
    attribute_state.expected_value::text AS expected,
    attribute_state.detail
FROM pg_catalog.pg_roles AS role_state
CROSS JOIN LATERAL (
    VALUES
        (
            'role_exists'::text,
            true,
            true,
            'CURRENT_USER is present in pg_roles.'::text
        ),
        (
            'rolsuper',
            role_state.rolsuper,
            true,
            'Diagnostic capability attribute; superuser is not required if all delegated authority predicates pass.'
        ),
        (
            'rolinherit',
            role_state.rolinherit,
            true,
            'Reports whether granted role privileges are inherited automatically.'
        ),
        (
            'rolcreaterole',
            role_state.rolcreaterole,
            true,
            'Reports ability to administer roles subject to PostgreSQL membership restrictions.'
        ),
        (
            'rolcreatedb',
            role_state.rolcreatedb,
            false,
            'Informational; not required by P2D.19 or P2D.20.'
        ),
        (
            'rolreplication',
            role_state.rolreplication,
            false,
            'Informational; not required by P2D.19 or P2D.20.'
        ),
        (
            'rolbypassrls',
            role_state.rolbypassrls,
            false,
            'Informational; not required by the installer contract.'
        )
) AS attribute_state(
    attribute_name,
    actual_value,
    expected_value,
    detail
)
WHERE role_state.rolname = CURRENT_USER
ORDER BY attribute_state.attribute_name;

SELECT
    'public_schema'::text AS section,
    predicate_state.predicate,
    CASE WHEN predicate_state.actual_value THEN 'PASS' ELSE 'FAIL' END
        AS result,
    predicate_state.actual_value::text AS actual,
    predicate_state.expected_value::text AS expected,
    predicate_state.detail
FROM pg_catalog.pg_namespace AS namespace_state
JOIN pg_catalog.pg_roles AS owner_role
  ON owner_role.oid = namespace_state.nspowner
CROSS JOIN LATERAL (
    VALUES
        (
            'schema_exists'::text,
            true,
            true,
            'public schema exists.'::text
        ),
        (
            'current_user_owns_schema',
            owner_role.rolname = CURRENT_USER,
            true,
            'Direct schema ownership; delegated CREATE may also satisfy installation.'
        ),
        (
            'current_user_has_create',
            pg_catalog.has_schema_privilege(
                CURRENT_USER,
                namespace_state.oid,
                'CREATE'
            ),
            true,
            'Exact first predicate from the P2D.21 authority gate.'
        ),
        (
            'current_user_has_usage',
            pg_catalog.has_schema_privilege(
                CURRENT_USER,
                namespace_state.oid,
                'USAGE'
            ),
            true,
            'Required to resolve and use objects in public.'
        )
) AS predicate_state(
    predicate,
    actual_value,
    expected_value,
    detail
)
WHERE namespace_state.nspname = 'public'
ORDER BY predicate_state.predicate;

WITH required_relations(relation_name) AS (
    VALUES
        ('atomic_authorization_contexts'::text),
        ('atomic_order_commands'),
        ('profiles'),
        ('tenants'),
        ('branches')
)
SELECT
    'relation_ownership'::text AS section,
    required_relation.relation_name AS predicate,
    CASE
        WHEN relation_state.oid IS NOT NULL
             AND (
                 installer_role.rolsuper
                 OR pg_catalog.pg_has_role(
                     CURRENT_USER,
                     relation_state.relowner,
                     'USAGE'
                 )
             )
            THEN 'PASS'
        ELSE 'FAIL'
    END AS result,
    COALESCE(owner_role.rolname, 'ABSENT') AS actual,
    'installer has owner authority'::text AS expected,
    CASE
        WHEN relation_state.oid IS NULL
            THEN 'Required relation is absent.'
        WHEN installer_role.rolsuper
            THEN 'Current role is superuser.'
        WHEN pg_catalog.pg_has_role(
            CURRENT_USER,
            relation_state.relowner,
            'USAGE'
        )
            THEN 'Current role has privileges of the relation owner.'
        ELSE 'Current role is neither superuser nor privileged as the relation owner.'
    END AS detail
FROM required_relations AS required_relation
LEFT JOIN pg_catalog.pg_class AS relation_state
  ON relation_state.oid = pg_catalog.to_regclass(
      'public.' || required_relation.relation_name
  )
LEFT JOIN pg_catalog.pg_roles AS owner_role
  ON owner_role.oid = relation_state.relowner
CROSS JOIN pg_catalog.pg_roles AS installer_role
WHERE installer_role.rolname = CURRENT_USER
ORDER BY required_relation.relation_name;

WITH required_roles(role_name, role_classification) AS (
    VALUES
        ('afex_core_owner'::text, 'P2D.15 owner role'::text),
        ('afex_core_runtime', 'P2D.15 runtime role'),
        ('afex_context_issuer', 'P2D.15 issuer role'),
        ('afex_outbox_worker', 'P2D.15 worker role'),
        ('afex_function_owner', 'P2D.15 function owner role'),
        ('afex_core_issuer', 'requested alias inspection'),
        ('afex_core_worker', 'requested alias inspection')
)
SELECT
    'role_authority'::text AS section,
    required_role.role_name || '.' || authority_state.authority_name
        AS predicate,
    CASE
        WHEN authority_state.actual_value IS NOT DISTINCT FROM
             authority_state.expected_value
            THEN 'PASS'
        ELSE 'FAIL'
    END AS result,
    COALESCE(authority_state.actual_value::text, 'ROLE_ABSENT') AS actual,
    authority_state.expected_value::text AS expected,
    required_role.role_classification || ': ' || authority_state.detail
        AS detail
FROM required_roles AS required_role
LEFT JOIN pg_catalog.pg_roles AS target_role
  ON target_role.rolname = required_role.role_name
CROSS JOIN LATERAL (
    VALUES
        (
            'exists'::text,
            target_role.oid IS NOT NULL,
            CASE
                WHEN required_role.role_name IN (
                    'afex_core_issuer',
                    'afex_core_worker'
                ) THEN false
                ELSE true
            END,
            'Exact role-name existence.'::text
        ),
        (
            'set_role',
            CASE
                WHEN target_role.oid IS NULL THEN NULL
                ELSE pg_catalog.pg_has_role(
                    CURRENT_USER,
                    target_role.oid,
                    'SET'
                )
            END,
            CASE
                WHEN required_role.role_name IN (
                    'afex_core_issuer',
                    'afex_core_worker'
                ) THEN NULL
                ELSE required_role.role_name IN (
                    'afex_core_owner',
                    'afex_function_owner'
                )
            END,
            'Effective SET ROLE capability; no SET ROLE is performed.'
        ),
        (
            'usage',
            CASE
                WHEN target_role.oid IS NULL THEN NULL
                ELSE pg_catalog.pg_has_role(
                    CURRENT_USER,
                    target_role.oid,
                    'USAGE'
                )
            END,
            CASE
                WHEN required_role.role_name IN (
                    'afex_core_issuer',
                    'afex_core_worker'
                ) THEN NULL
                ELSE required_role.role_name = 'afex_core_owner'
            END,
            'Effective privileges-of-role capability; no role is assumed.'
        )
) AS authority_state(
    authority_name,
    actual_value,
    expected_value,
    detail
)
ORDER BY required_role.role_name, authority_state.authority_name;

SELECT
    'role_memberships'::text AS section,
    granted_role.rolname || '->' || member_role.rolname AS predicate,
    'PASS'::text AS result,
    pg_catalog.jsonb_build_object(
        'grantor', grantor_role.rolname,
        'admin_option', membership_state.admin_option,
        'inherit_option', membership_state.inherit_option,
        'set_option', membership_state.set_option
    )::text AS actual,
    'catalog evidence'::text AS expected,
    'All memberships involving CURRENT_USER or a P2D.15 target role.'
        AS detail
FROM pg_catalog.pg_auth_members AS membership_state
JOIN pg_catalog.pg_roles AS granted_role
  ON granted_role.oid = membership_state.roleid
JOIN pg_catalog.pg_roles AS member_role
  ON member_role.oid = membership_state.member
JOIN pg_catalog.pg_roles AS grantor_role
  ON grantor_role.oid = membership_state.grantor
WHERE member_role.rolname = CURRENT_USER
   OR granted_role.rolname = CURRENT_USER
   OR granted_role.rolname IN (
       'afex_core_owner',
       'afex_core_runtime',
       'afex_context_issuer',
       'afex_outbox_worker',
       'afex_function_owner'
   )
   OR member_role.rolname IN (
       'afex_core_owner',
       'afex_core_runtime',
       'afex_context_issuer',
       'afex_outbox_worker',
       'afex_function_owner'
   )
ORDER BY granted_role.rolname, member_role.rolname, grantor_role.rolname;

WITH authority_predicates(predicate, actual_value, expected_value) AS (
    SELECT
        'public_schema_create'::text,
        pg_catalog.has_schema_privilege(CURRENT_USER, 'public', 'CREATE'),
        true
    UNION ALL
    SELECT
        'afex_core_owner_set',
        pg_catalog.pg_has_role(
            CURRENT_USER,
            target_role.oid,
            'SET'
        ),
        true
    FROM pg_catalog.pg_roles AS target_role
    WHERE target_role.rolname = 'afex_core_owner'
    UNION ALL
    SELECT
        'afex_core_owner_usage',
        pg_catalog.pg_has_role(
            CURRENT_USER,
            target_role.oid,
            'USAGE'
        ),
        true
    FROM pg_catalog.pg_roles AS target_role
    WHERE target_role.rolname = 'afex_core_owner'
    UNION ALL
    SELECT
        'afex_function_owner_set',
        pg_catalog.pg_has_role(
            CURRENT_USER,
            target_role.oid,
            'SET'
        ),
        true
    FROM pg_catalog.pg_roles AS target_role
    WHERE target_role.rolname = 'afex_function_owner'
)
SELECT
    'exact_p2d21_failed_gate'::text AS section,
    expected_predicate.predicate,
    CASE
        WHEN authority_predicate.actual_value IS NOT DISTINCT FROM
             expected_predicate.expected_value
            THEN 'PASS'
        ELSE 'FAIL'
    END AS result,
    COALESCE(authority_predicate.actual_value::text, 'ROLE_ABSENT')
        AS actual,
    expected_predicate.expected_value::text AS expected,
    CASE
        WHEN authority_predicate.predicate IS NULL
            THEN 'Required role is absent, so the predicate is false.'
        ELSE 'Exact boolean component of P2D.21 lines 552-571.'
    END AS detail
FROM (
    VALUES
        ('public_schema_create'::text, true),
        ('afex_core_owner_set', true),
        ('afex_core_owner_usage', true),
        ('afex_function_owner_set', true)
) AS expected_predicate(predicate, expected_value)
LEFT JOIN authority_predicates AS authority_predicate
  ON authority_predicate.predicate = expected_predicate.predicate
ORDER BY expected_predicate.predicate;

WITH required_operations(
    operation_name,
    target_role_name,
    relation_name
) AS (
    VALUES
        (
            'create_payload_table_then_transfer_owner'::text,
            'afex_core_owner'::text,
            NULL::text
        ),
        (
            'create_canonicalizer_then_transfer_owner',
            'afex_function_owner',
            NULL
        ),
        (
            'create_acquisition_then_transfer_owner',
            'afex_function_owner',
            NULL
        ),
        (
            'create_policy_profiles',
            NULL,
            'profiles'
        ),
        (
            'create_policy_tenants',
            NULL,
            'tenants'
        ),
        (
            'create_policy_branches',
            NULL,
            'branches'
        ),
        (
            'grant_revoke_profiles_columns',
            NULL,
            'profiles'
        ),
        (
            'grant_revoke_tenants_columns',
            NULL,
            'tenants'
        ),
        (
            'grant_revoke_branches_columns',
            NULL,
            'branches'
        ),
        (
            'alter_rls_profiles',
            NULL,
            'profiles'
        ),
        (
            'alter_rls_tenants',
            NULL,
            'tenants'
        ),
        (
            'alter_rls_branches',
            NULL,
            'branches'
        )
)
SELECT
    'derived_install_operations'::text AS section,
    required_operation.operation_name AS predicate,
    CASE
        WHEN required_operation.target_role_name IS NOT NULL THEN
            CASE
                WHEN pg_catalog.has_schema_privilege(
                         CURRENT_USER,
                         'public',
                         'CREATE'
                     )
                     AND target_role.oid IS NOT NULL
                     AND pg_catalog.pg_has_role(
                         CURRENT_USER,
                         target_role.oid,
                         'SET'
                     )
                    THEN 'PASS'
                ELSE 'FAIL'
            END
        WHEN relation_state.oid IS NOT NULL
             AND (
                 installer_role.rolsuper
                 OR pg_catalog.pg_has_role(
                     CURRENT_USER,
                     relation_state.relowner,
                     'USAGE'
                 )
             )
            THEN 'PASS'
        ELSE 'FAIL'
    END AS result,
    CASE
        WHEN required_operation.target_role_name IS NOT NULL THEN
            pg_catalog.jsonb_build_object(
                'schema_create',
                pg_catalog.has_schema_privilege(
                    CURRENT_USER,
                    'public',
                    'CREATE'
                ),
                'target_role_exists',
                target_role.oid IS NOT NULL,
                'target_set_role',
                CASE
                    WHEN target_role.oid IS NULL THEN false
                    ELSE pg_catalog.pg_has_role(
                        CURRENT_USER,
                        target_role.oid,
                        'SET'
                    )
                END
            )::text
        ELSE
            pg_catalog.jsonb_build_object(
                'relation_exists',
                relation_state.oid IS NOT NULL,
                'relation_owner',
                owner_role.rolname,
                'superuser',
                installer_role.rolsuper,
                'owner_authority',
                CASE
                    WHEN relation_state.oid IS NULL THEN false
                    ELSE pg_catalog.pg_has_role(
                        CURRENT_USER,
                        relation_state.relowner,
                        'USAGE'
                    )
                END
            )::text
    END AS actual,
    'all required authority predicates true'::text AS expected,
    'Read-only catalog-derived capability; no operation is attempted.'
        AS detail
FROM required_operations AS required_operation
CROSS JOIN pg_catalog.pg_roles AS installer_role
LEFT JOIN pg_catalog.pg_roles AS target_role
  ON target_role.rolname = required_operation.target_role_name
LEFT JOIN pg_catalog.pg_class AS relation_state
  ON relation_state.oid = pg_catalog.to_regclass(
      'public.' || required_operation.relation_name
  )
LEFT JOIN pg_catalog.pg_roles AS owner_role
  ON owner_role.oid = relation_state.relowner
WHERE installer_role.rolname = CURRENT_USER
ORDER BY required_operation.operation_name;

WITH target_roles AS (
    SELECT role_state.oid, role_state.rolname
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname IN (
        'afex_core_owner',
        'afex_function_owner'
    )
),
current_state AS (
    SELECT
        installer_role.rolsuper,
        installer_role.rolcreaterole,
        pg_catalog.has_schema_privilege(
            CURRENT_USER,
            'public',
            'CREATE'
        ) AS schema_create,
        pg_catalog.count(target_role.oid) = 2
        AND COALESCE(
            pg_catalog.bool_and(
                pg_catalog.pg_has_role(
                    CURRENT_USER,
                    target_role.oid,
                    'SET'
                )
            ),
            false
        ) AS target_set,
        COALESCE(
            pg_catalog.bool_or(
                target_role.rolname = 'afex_core_owner'
                AND pg_catalog.pg_has_role(
                    CURRENT_USER,
                    target_role.oid,
                    'USAGE'
                )
            ),
            false
        ) AS core_owner_usage,
        (
            SELECT pg_catalog.bool_and(
                relation_state.oid IS NOT NULL
                AND (
                    installer_role.rolsuper
                    OR pg_catalog.pg_has_role(
                        CURRENT_USER,
                        relation_state.relowner,
                        'USAGE'
                    )
                )
            )
            FROM (
                VALUES
                    ('profiles'::text),
                    ('tenants'),
                    ('branches')
            ) AS required_relation(relation_name)
            LEFT JOIN pg_catalog.pg_class AS relation_state
              ON relation_state.oid = pg_catalog.to_regclass(
                  'public.' || required_relation.relation_name
              )
        ) AS authorization_relation_owner_authority
    FROM pg_catalog.pg_roles AS installer_role
    CROSS JOIN target_roles AS target_role
    WHERE installer_role.rolname = CURRENT_USER
    GROUP BY
        installer_role.rolsuper,
        installer_role.rolcreaterole
),
alternative_login AS (
    SELECT candidate_role.rolname
    FROM pg_catalog.pg_roles AS candidate_role
    WHERE candidate_role.rolcanlogin
      AND candidate_role.rolname <> CURRENT_USER
      AND pg_catalog.has_schema_privilege(
          candidate_role.rolname,
          'public',
          'CREATE'
      )
      AND (
          candidate_role.rolsuper
          OR (
              SELECT pg_catalog.bool_and(
                  pg_catalog.pg_has_role(
                      candidate_role.rolname,
                      target_role.oid,
                      'SET'
                  )
              )
              FROM target_roles AS target_role
          )
      )
      AND (
          candidate_role.rolsuper
          OR (
              SELECT pg_catalog.bool_and(
                  relation_state.oid IS NOT NULL
                  AND pg_catalog.pg_has_role(
                      candidate_role.rolname,
                      relation_state.relowner,
                      'USAGE'
                  )
              )
              FROM (
                  VALUES
                      ('profiles'::text),
                      ('tenants'),
                      ('branches')
              ) AS required_relation(relation_name)
              LEFT JOIN pg_catalog.pg_class AS relation_state
                ON relation_state.oid = pg_catalog.to_regclass(
                    'public.' || required_relation.relation_name
                )
          )
      )
      AND (
          candidate_role.rolsuper
          OR EXISTS (
              SELECT 1
              FROM target_roles AS target_role
              WHERE target_role.rolname = 'afex_core_owner'
                AND pg_catalog.pg_has_role(
                    candidate_role.rolname,
                    target_role.oid,
                    'USAGE'
                )
          )
      )
    ORDER BY candidate_role.rolname
    LIMIT 1
)
SELECT
    'decision'::text AS section,
    'installer_authority_classification'::text AS predicate,
    CASE
        WHEN current_state.schema_create
             AND current_state.target_set
             AND current_state.core_owner_usage
             AND current_state.authorization_relation_owner_authority
            THEN 'A'
        WHEN EXISTS (SELECT 1 FROM alternative_login)
            THEN 'B'
        WHEN current_state.rolcreaterole
            THEN 'D'
        ELSE 'C'
    END AS result,
    CASE
        WHEN current_state.schema_create
             AND current_state.target_set
             AND current_state.core_owner_usage
             AND current_state.authorization_relation_owner_authority
            THEN 'A. Current postgres role is sufficient; preflight authority predicate is incorrect.'
        WHEN EXISTS (SELECT 1 FROM alternative_login)
            THEN 'B. A different existing Supabase database role must be used.'
        WHEN current_state.rolcreaterole
            THEN 'D. Additional narrowly scoped role membership/grant is required before installation.'
        ELSE 'C. Required ownership-transfer model is incompatible with observed Supabase-managed role restrictions and the package must be revised.'
    END AS actual,
    'exactly one of A, B, C, or D'::text AS expected,
    COALESCE(
        (
            SELECT
                'Catalog-qualified alternative LOGIN role: ' ||
                alternative_login.rolname
            FROM alternative_login
        ),
        'No catalog-qualified alternative LOGIN role was identified.'
    ) AS detail
FROM current_state;

SELECT
    'PASS'::text AS diagnostic_status,
    'P2D21K_900_INSTALLER_AUTHORITY_DIAGNOSTIC_COMPLETE'::text
        AS marker;

ROLLBACK;

-- END OF P2D.21K READ-ONLY INSTALLER AUTHORITY DIAGNOSTIC
