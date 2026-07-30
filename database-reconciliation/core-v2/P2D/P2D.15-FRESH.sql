-- AFEX Core V2
-- P2D.15-FRESH
-- P2D.15A — Fresh Security Roles Foundation
-- STATUS: DRAFT — READY FOR FINAL EXTERNAL REVIEW
-- Production preflight classification: NOT_INSTALLED
-- Manual execution only after ChatGPT review

BEGIN;

DO $diagnostic$ BEGIN RAISE NOTICE 'P2D15G_000_BEGIN'; END $diagnostic$;

DO $preflight$
DECLARE
    conflicting_roles text[];
BEGIN
    RAISE NOTICE 'P2D15G_100_P2D15A_PREFLIGHT_BEGIN';

    SELECT array_agg(target_role ORDER BY target_role)
    INTO conflicting_roles
    FROM unnest(ARRAY[
        'afex_core_owner',
        'afex_core_runtime',
        'afex_context_issuer',
        'afex_outbox_worker',
        'afex_function_owner'
    ]::text[]) AS target_role
    WHERE EXISTS (
        SELECT 1
        FROM pg_catalog.pg_roles AS existing_role
        WHERE existing_role.rolname = target_role
    );

    IF conflicting_roles IS NOT NULL THEN
        RAISE EXCEPTION USING
            errcode = '42710',
            message = 'P2D.15A preflight failed: target role names already exist',
            detail = array_to_string(conflicting_roles, ', ');
    END IF;

    RAISE NOTICE 'P2D15G_110_P2D15A_PREFLIGHT_OK';
END
$preflight$;

DO $diagnostic$ BEGIN RAISE NOTICE 'P2D15G_120_ROLE_CREATION_BEGIN'; END $diagnostic$;

CREATE ROLE afex_core_owner
    NOLOGIN
    NOINHERIT
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    NOREPLICATION
    NOBYPASSRLS
    PASSWORD NULL;

CREATE ROLE afex_core_runtime
    NOLOGIN
    NOINHERIT
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    NOREPLICATION
    NOBYPASSRLS
    PASSWORD NULL;

CREATE ROLE afex_context_issuer
    NOLOGIN
    NOINHERIT
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    NOREPLICATION
    NOBYPASSRLS
    PASSWORD NULL;

CREATE ROLE afex_outbox_worker
    NOLOGIN
    NOINHERIT
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    NOREPLICATION
    NOBYPASSRLS
    PASSWORD NULL;

CREATE ROLE afex_function_owner
    NOLOGIN
    NOINHERIT
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE
    NOREPLICATION
    NOBYPASSRLS
    PASSWORD NULL;

DO $diagnostic$ BEGIN RAISE NOTICE 'P2D15G_130_ROLE_CREATION_OK'; END $diagnostic$;

DO $automatic_membership_preflight$
DECLARE
    installation_role_oid oid;
    installation_role_count integer;
    target_role_oids oid[];
    target_role_count integer;
    membership_count integer;
    invalid_membership_count integer;
    membership_option_shape_count integer;
    automatic_grantor_count integer;
BEGIN
    RAISE NOTICE 'P2D15G_140_MEMBERSHIP_RECONCILIATION_BEGIN';

    SELECT
        (pg_catalog.array_agg(role_state.oid))[1],
        pg_catalog.count(*)
    INTO
        installation_role_oid,
        installation_role_count
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname = CURRENT_USER;

    IF installation_role_count <> 1
       OR installation_role_oid IS NULL THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15A automatic-membership preflight failed: installation identity is invalid';
    END IF;

    SELECT
        pg_catalog.array_agg(
            role_state.oid
            ORDER BY role_state.rolname
        ),
        pg_catalog.count(*)
    INTO
        target_role_oids,
        target_role_count
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname = ANY (
        ARRAY[
            'afex_core_owner',
            'afex_core_runtime',
            'afex_context_issuer',
            'afex_outbox_worker',
            'afex_function_owner'
        ]
    );

    IF target_role_count <> 5 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15A automatic-membership preflight failed: target role count is invalid',
            detail = pg_catalog.format(
                'Expected 5 roles, found %s',
                target_role_count
            );
    END IF;

    SELECT pg_catalog.count(*)
    INTO membership_count
    FROM pg_catalog.pg_auth_members AS membership
    WHERE membership.roleid = ANY (target_role_oids)
       OR membership.member = ANY (target_role_oids);

    SELECT pg_catalog.count(*)
    INTO invalid_membership_count
    FROM pg_catalog.pg_auth_members AS membership
    WHERE (
            membership.roleid = ANY (target_role_oids)
            OR membership.member = ANY (target_role_oids)
          )
      AND NOT (
            membership.roleid = ANY (target_role_oids)
            AND membership.member = installation_role_oid
            AND membership.member <> ALL (target_role_oids)
          );

    SELECT pg_catalog.count(DISTINCT membership_options.option_shape)
    INTO membership_option_shape_count
    FROM (
        SELECT pg_catalog.jsonb_strip_nulls(
            pg_catalog.jsonb_build_object(
                'admin_option',
                pg_catalog.to_jsonb(membership)->'admin_option',
                'inherit_option',
                pg_catalog.to_jsonb(membership)->'inherit_option',
                'set_option',
                pg_catalog.to_jsonb(membership)->'set_option'
            )
        ) AS option_shape
        FROM pg_catalog.pg_auth_members AS membership
        WHERE membership.roleid = ANY (target_role_oids)
          AND membership.member = installation_role_oid
    ) AS membership_options;

    SELECT pg_catalog.count(DISTINCT membership.grantor)
    INTO automatic_grantor_count
    FROM pg_catalog.pg_auth_members AS membership
    WHERE membership.roleid = ANY (target_role_oids)
      AND membership.member = installation_role_oid
      AND membership.grantor <> installation_role_oid;

    IF membership_count <> 5
       OR invalid_membership_count <> 0
       OR membership_option_shape_count <> 1
       OR automatic_grantor_count <> 1
       OR EXISTS (
          SELECT 1
          FROM pg_catalog.pg_auth_members AS membership
          WHERE membership.roleid = ANY (target_role_oids)
            AND membership.member = installation_role_oid
            AND membership.grantor = installation_role_oid
       )
       OR EXISTS (
          SELECT 1
          FROM unnest(target_role_oids) AS target_role(role_oid)
          WHERE (
              SELECT pg_catalog.count(*)
              FROM pg_catalog.pg_auth_members AS membership
              WHERE membership.roleid = target_role.role_oid
                AND membership.member = installation_role_oid
          ) <> 1
       )
       OR EXISTS (
          SELECT 1
          FROM pg_catalog.pg_auth_members AS membership
          WHERE membership.member = ANY (target_role_oids)
       )
       OR EXISTS (
          SELECT 1
          FROM pg_catalog.pg_auth_members AS membership
          WHERE membership.roleid = ANY (target_role_oids)
            AND membership.member = installation_role_oid
            AND (
                pg_catalog.to_jsonb(membership)->'admin_option'
                    IS DISTINCT FROM
                    'true'::jsonb
                OR pg_catalog.to_jsonb(membership)->'inherit_option'
                    IS DISTINCT FROM
                    'false'::jsonb
                OR pg_catalog.to_jsonb(membership)->'set_option'
                    IS DISTINCT FROM
                    'false'::jsonb
            )
       ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15A automatic-membership preflight failed: membership pattern is unexpected',
            detail = pg_catalog.format(
                'Expected 5 creator memberships, found %s; invalid rows: %s; option shapes: %s; automatic grantors: %s',
                membership_count,
                invalid_membership_count,
                membership_option_shape_count,
                automatic_grantor_count
            );
    END IF;

    RAISE NOTICE 'P2D15G_150_MEMBERSHIP_RECONCILIATION_OK';
END
$automatic_membership_preflight$;

DO $diagnostic$ BEGIN RAISE NOTICE 'P2D15P_141_AUTOMATIC_MEMBERSHIP_CONTRACT_OK'; END $diagnostic$;
DO $diagnostic$ BEGIN RAISE NOTICE 'P2D15P_142_TEMPORARY_OWNER_SET_GRANT_BEGIN'; END $diagnostic$;

GRANT afex_core_owner TO CURRENT_USER
    WITH ADMIN FALSE, INHERIT FALSE, SET TRUE
    GRANTED BY CURRENT_USER;

DO $bootstrap_owner_membership_verification$
DECLARE
    installation_role_oid oid;
    core_owner_oid oid;
    target_role_oids oid[];
    automatic_grantor_oid oid;
BEGIN
    SELECT role_state.oid
    INTO installation_role_oid
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname = CURRENT_USER;

    SELECT role_state.oid
    INTO core_owner_oid
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname = 'afex_core_owner';

    SELECT pg_catalog.array_agg(role_state.oid ORDER BY role_state.rolname)
    INTO target_role_oids
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname = ANY (ARRAY[
        'afex_core_owner',
        'afex_core_runtime',
        'afex_context_issuer',
        'afex_outbox_worker',
        'afex_function_owner'
    ]);

    SELECT
        (pg_catalog.array_agg(
            DISTINCT membership.grantor
            ORDER BY membership.grantor
        ))[1]
    INTO automatic_grantor_oid
    FROM pg_catalog.pg_auth_members AS membership
    WHERE membership.roleid = ANY (target_role_oids)
      AND membership.member = installation_role_oid
      AND membership.grantor <> installation_role_oid
      AND membership.admin_option
      AND NOT membership.inherit_option
      AND NOT membership.set_option;

    IF installation_role_oid IS NULL
       OR core_owner_oid IS NULL
       OR automatic_grantor_oid IS NULL
       OR automatic_grantor_oid = installation_role_oid
       OR pg_catalog.cardinality(target_role_oids) <> 5
       OR (
            SELECT pg_catalog.count(*)
            FROM pg_catalog.pg_auth_members AS membership
            WHERE membership.roleid = ANY (target_role_oids)
               OR membership.member = ANY (target_role_oids)
       ) <> 6
       OR EXISTS (
            SELECT 1
            FROM unnest(target_role_oids) AS target_role(role_oid)
            WHERE (
                SELECT pg_catalog.count(*)
                FROM pg_catalog.pg_auth_members AS membership
                WHERE membership.roleid = target_role.role_oid
                  AND membership.member = installation_role_oid
            ) <> CASE
                WHEN target_role.role_oid = core_owner_oid THEN 2
                ELSE 1
            END
       )
       OR (
            SELECT pg_catalog.count(*)
            FROM pg_catalog.pg_auth_members AS membership
            WHERE membership.roleid = core_owner_oid
              AND membership.member = installation_role_oid
              AND membership.grantor = automatic_grantor_oid
              AND membership.member <> ALL (target_role_oids)
              AND membership.admin_option
              AND NOT membership.inherit_option
              AND NOT membership.set_option
       ) <> 1
       OR (
            SELECT pg_catalog.count(*)
            FROM pg_catalog.pg_auth_members AS membership
            WHERE membership.roleid = ANY (target_role_oids)
              AND membership.member = installation_role_oid
              AND membership.grantor = automatic_grantor_oid
              AND membership.member <> ALL (target_role_oids)
              AND membership.admin_option
              AND NOT membership.inherit_option
              AND NOT membership.set_option
       ) <> 5
       OR (
            SELECT pg_catalog.count(*)
            FROM pg_catalog.pg_auth_members AS membership
            WHERE membership.roleid = core_owner_oid
              AND membership.member = installation_role_oid
              AND membership.grantor = installation_role_oid
              AND NOT membership.admin_option
              AND NOT membership.inherit_option
              AND membership.set_option
       ) <> 1
       OR EXISTS (
            SELECT 1
            FROM pg_catalog.pg_auth_members AS membership
            WHERE membership.member = ANY (target_role_oids)
       )
       OR NOT pg_catalog.pg_has_role(
            installation_role_oid,
            core_owner_oid,
            'SET'
       ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15A bootstrap owner membership verification failed';
    END IF;
END
$bootstrap_owner_membership_verification$;

DO $diagnostic$ BEGIN RAISE NOTICE 'P2D15P_143_TEMPORARY_OWNER_SET_GRANT_OK'; END $diagnostic$;

GRANT CREATE ON SCHEMA public TO afex_core_owner;

DO $bootstrap_owner_schema_verification$
DECLARE
    core_owner_oid oid;
    target_role_oids oid[];
    public_schema_oid oid;
BEGIN
    SELECT role_state.oid
    INTO core_owner_oid
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname = 'afex_core_owner';

    SELECT pg_catalog.array_agg(role_state.oid ORDER BY role_state.rolname)
    INTO target_role_oids
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname = ANY (ARRAY[
        'afex_core_owner',
        'afex_core_runtime',
        'afex_context_issuer',
        'afex_outbox_worker',
        'afex_function_owner'
    ]);

    SELECT namespace_state.oid
    INTO public_schema_oid
    FROM pg_catalog.pg_namespace AS namespace_state
    WHERE namespace_state.nspname = 'public';

    IF core_owner_oid IS NULL
       OR public_schema_oid IS NULL
       OR pg_catalog.cardinality(target_role_oids) <> 5
       OR NOT pg_catalog.has_schema_privilege(
            core_owner_oid,
            public_schema_oid,
            'CREATE'
       )
       OR NOT pg_catalog.has_schema_privilege(
            core_owner_oid,
            public_schema_oid,
            'USAGE'
       )
       OR (
            SELECT pg_catalog.count(*)
            FROM pg_catalog.aclexplode(
                CASE
                    WHEN pg_catalog.array_ndims(
                        (
                            SELECT namespace_state.nspacl
                            FROM pg_catalog.pg_namespace AS namespace_state
                            WHERE namespace_state.oid = public_schema_oid
                        )
                    ) = 1 THEN (
                        SELECT namespace_state.nspacl
                        FROM pg_catalog.pg_namespace AS namespace_state
                        WHERE namespace_state.oid = public_schema_oid
                    )
                    ELSE NULL::pg_catalog.aclitem[]
                END
            ) AS acl_state
            WHERE acl_state.grantee = ANY (target_role_oids)
              AND (
                  acl_state.grantee <> core_owner_oid
                  OR acl_state.privilege_type <> 'CREATE'
                  OR acl_state.is_grantable
              )
       ) <> 0
       OR (
            SELECT pg_catalog.count(*)
            FROM pg_catalog.aclexplode(
                CASE
                    WHEN pg_catalog.array_ndims(
                        (
                            SELECT namespace_state.nspacl
                            FROM pg_catalog.pg_namespace AS namespace_state
                            WHERE namespace_state.oid = public_schema_oid
                        )
                    ) = 1 THEN (
                        SELECT namespace_state.nspacl
                        FROM pg_catalog.pg_namespace AS namespace_state
                        WHERE namespace_state.oid = public_schema_oid
                    )
                    ELSE NULL::pg_catalog.aclitem[]
                END
            ) AS acl_state
            WHERE acl_state.grantee = core_owner_oid
              AND acl_state.privilege_type = 'CREATE'
              AND NOT acl_state.is_grantable
       ) <> 1 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15A bootstrap owner schema privilege verification failed';
    END IF;
END
$bootstrap_owner_schema_verification$;

DO $diagnostic$ BEGIN RAISE NOTICE 'P2D15M_144_OWNER_SCHEMA_CREATE_OK'; END $diagnostic$;

ALTER ROLE afex_core_owner
    SET search_path TO pg_catalog, public;

ALTER ROLE afex_core_runtime
    SET search_path TO pg_catalog, public;

ALTER ROLE afex_context_issuer
    SET search_path TO pg_catalog, public;

ALTER ROLE afex_outbox_worker
    SET search_path TO pg_catalog, public;

ALTER ROLE afex_function_owner
    SET search_path TO pg_catalog, public;

DO $verification$
DECLARE
    installation_role_oid oid;
    installation_role_count integer;
    core_owner_oid oid;
    automatic_grantor_oid oid;
    target_role_oids oid[];
    target_role_count integer;
    invalid_attribute_count integer;
    invalid_role_configuration_count integer;
    membership_count integer;
    owned_object_count integer;
    default_acl_participation_count integer;
    direct_privilege_count integer;
BEGIN
    RAISE NOTICE 'P2D15G_160_P2D15A_VERIFICATION_BEGIN';

    SELECT
        array_agg(role_state.oid ORDER BY role_state.rolname),
        count(*)
    INTO
        target_role_oids,
        target_role_count
    FROM pg_catalog.pg_authid AS role_state
    WHERE role_state.rolname = ANY (ARRAY[
        'afex_core_owner',
        'afex_core_runtime',
        'afex_context_issuer',
        'afex_outbox_worker',
        'afex_function_owner'
    ]);

    IF target_role_count <> 5 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15A verification failed: expected exactly five target roles',
            detail = pg_catalog.format(
                'Expected 5 roles, found %s',
                target_role_count
            );
    END IF;

    SELECT count(*)
    INTO invalid_attribute_count
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
      );

    IF invalid_attribute_count <> 0 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15A verification failed: target role attributes do not match the frozen contract',
            detail = pg_catalog.format(
                'Roles with invalid attributes: %s',
                invalid_attribute_count
            );
    END IF;

    SELECT pg_catalog.count(*)
    INTO invalid_role_configuration_count
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.oid = ANY (target_role_oids)
      AND (
          (
              SELECT pg_catalog.count(*)
              FROM pg_catalog.pg_db_role_setting AS setting_state
              WHERE setting_state.setrole = role_state.oid
                AND setting_state.setdatabase = 0
          ) <> 1
          OR NOT EXISTS (
              SELECT 1
              FROM pg_catalog.pg_db_role_setting AS setting_state
              WHERE setting_state.setrole = role_state.oid
                AND setting_state.setdatabase = 0
                AND setting_state.setconfig IS NOT NULL
                AND pg_catalog.array_ndims(setting_state.setconfig) = 1
                AND pg_catalog.cardinality(setting_state.setconfig) = 1
                AND setting_state.setconfig[1] =
                    'search_path=pg_catalog, public'
          )
          OR EXISTS (
              SELECT 1
              FROM pg_catalog.pg_db_role_setting AS setting_state
              WHERE setting_state.setrole = role_state.oid
                AND setting_state.setdatabase <> 0
          )
      );

    IF invalid_role_configuration_count <> 0 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15A verification failed: defensive search_path configuration is invalid',
            detail = pg_catalog.format(
                'Roles with invalid configuration: %s',
                invalid_role_configuration_count
            );
    END IF;

    SELECT
        (pg_catalog.array_agg(role_state.oid))[1],
        pg_catalog.count(*)
    INTO
        installation_role_oid,
        installation_role_count
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname = CURRENT_USER;

    IF installation_role_count <> 1
       OR installation_role_oid IS NULL THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15A verification failed: installation identity is invalid';
    END IF;

    SELECT role_state.oid
    INTO core_owner_oid
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname = 'afex_core_owner';

    SELECT
        (pg_catalog.array_agg(
            DISTINCT membership.grantor
            ORDER BY membership.grantor
        ))[1]
    INTO automatic_grantor_oid
    FROM pg_catalog.pg_auth_members AS membership
    WHERE membership.roleid = ANY (target_role_oids)
      AND membership.member = installation_role_oid
      AND membership.grantor <> installation_role_oid
      AND membership.admin_option
      AND NOT membership.inherit_option
      AND NOT membership.set_option;

    SELECT pg_catalog.count(*)
    INTO membership_count
    FROM pg_catalog.pg_auth_members AS membership
    WHERE membership.roleid = ANY (target_role_oids)
       OR membership.member = ANY (target_role_oids);

    IF core_owner_oid IS NULL
       OR automatic_grantor_oid IS NULL
       OR automatic_grantor_oid = installation_role_oid
       OR membership_count <> 6
       OR (
            SELECT pg_catalog.count(*)
            FROM pg_catalog.pg_auth_members AS membership
            WHERE membership.roleid = core_owner_oid
              AND membership.member = installation_role_oid
              AND membership.grantor = automatic_grantor_oid
              AND membership.member <> ALL (target_role_oids)
              AND membership.admin_option
              AND NOT membership.inherit_option
              AND NOT membership.set_option
       ) <> 1
       OR (
            SELECT pg_catalog.count(*)
            FROM pg_catalog.pg_auth_members AS membership
            WHERE membership.roleid = ANY (target_role_oids)
              AND membership.member = installation_role_oid
              AND membership.grantor = automatic_grantor_oid
              AND membership.member <> ALL (target_role_oids)
              AND membership.admin_option
              AND NOT membership.inherit_option
              AND NOT membership.set_option
       ) <> 5
       OR (
            SELECT pg_catalog.count(*)
            FROM pg_catalog.pg_auth_members AS membership
            WHERE membership.roleid = core_owner_oid
              AND membership.member = installation_role_oid
              AND membership.grantor = installation_role_oid
              AND NOT membership.admin_option
              AND NOT membership.inherit_option
              AND membership.set_option
       ) <> 1
       OR EXISTS (
            SELECT 1
            FROM unnest(target_role_oids) AS target_role(role_oid)
            WHERE (
                SELECT pg_catalog.count(*)
                FROM pg_catalog.pg_auth_members AS membership
                WHERE membership.roleid = target_role.role_oid
                  AND membership.member = installation_role_oid
            ) <> CASE
                WHEN target_role.role_oid = core_owner_oid THEN 2
                ELSE 1
            END
       )
       OR EXISTS (
            SELECT 1
            FROM pg_catalog.pg_auth_members AS membership
            WHERE membership.member = ANY (target_role_oids)
       ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15A verification failed: temporary bootstrap membership contract mismatch',
            detail = pg_catalog.format(
                'Expected 6 bootstrap memberships, found %s',
                membership_count
            );
    END IF;

    SELECT count(*)
    INTO owned_object_count
    FROM (
        SELECT namespace_state.oid
        FROM pg_catalog.pg_namespace AS namespace_state
        WHERE namespace_state.nspowner = ANY (target_role_oids)

        UNION ALL

        SELECT relation_state.oid
        FROM pg_catalog.pg_class AS relation_state
        WHERE relation_state.relowner = ANY (target_role_oids)
          AND relation_state.relkind IN (
              'r',
              'p',
              'S',
              'v',
              'm',
              'f'
          )

        UNION ALL

        SELECT routine_state.oid
        FROM pg_catalog.pg_proc AS routine_state
        WHERE routine_state.proowner = ANY (target_role_oids)
          AND routine_state.prokind IN ('f', 'p')

        UNION ALL

        SELECT type_state.oid
        FROM pg_catalog.pg_type AS type_state
        WHERE type_state.typowner = ANY (target_role_oids)
          AND type_state.typtype IN ('c', 'd', 'e', 'r', 'm')
    ) AS owned_objects;

    IF owned_object_count <> 0 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15A verification failed: a target role owns an object',
            detail = pg_catalog.format(
                'Owned objects: %s',
                owned_object_count
            );
    END IF;

    SELECT count(*)
    INTO default_acl_participation_count
    FROM pg_catalog.pg_default_acl AS default_acl
    WHERE default_acl.defaclrole = ANY (target_role_oids)
       OR EXISTS (
          SELECT 1
          FROM pg_catalog.aclexplode(
              CASE
                  WHEN pg_catalog.array_ndims(
                      default_acl.defaclacl
                  ) = 1 THEN default_acl.defaclacl
                  ELSE NULL::pg_catalog.aclitem[]
              END
          ) AS acl_entry
          WHERE acl_entry.grantee = ANY (target_role_oids)
       );

    IF default_acl_participation_count <> 0 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15A verification failed: a target role participates in default privileges',
            detail = pg_catalog.format(
                'Default ACL rows: %s',
                default_acl_participation_count
            );
    END IF;

    SELECT count(*)
    INTO direct_privilege_count
    FROM (
        SELECT acl_entry.grantee
        FROM pg_catalog.pg_database AS database_state
        CROSS JOIN LATERAL pg_catalog.aclexplode(
            CASE
                WHEN pg_catalog.array_ndims(
                    database_state.datacl
                ) = 1 THEN database_state.datacl
                ELSE NULL::pg_catalog.aclitem[]
            END
        ) AS acl_entry

        UNION ALL

        SELECT acl_entry.grantee
        FROM pg_catalog.pg_namespace AS namespace_state
        CROSS JOIN LATERAL pg_catalog.aclexplode(
            CASE
                WHEN pg_catalog.array_ndims(
                    namespace_state.nspacl
                ) = 1 THEN namespace_state.nspacl
                ELSE NULL::pg_catalog.aclitem[]
            END
        ) AS acl_entry

        UNION ALL

        SELECT acl_entry.grantee
        FROM pg_catalog.pg_class AS relation_state
        CROSS JOIN LATERAL pg_catalog.aclexplode(
            CASE
                WHEN pg_catalog.array_ndims(
                    relation_state.relacl
                ) = 1 THEN relation_state.relacl
                ELSE NULL::pg_catalog.aclitem[]
            END
        ) AS acl_entry

        UNION ALL

        SELECT acl_entry.grantee
        FROM pg_catalog.pg_proc AS routine_state
        CROSS JOIN LATERAL pg_catalog.aclexplode(
            CASE
                WHEN pg_catalog.array_ndims(
                    routine_state.proacl
                ) = 1 THEN routine_state.proacl
                ELSE NULL::pg_catalog.aclitem[]
            END
        ) AS acl_entry

        UNION ALL

        SELECT acl_entry.grantee
        FROM pg_catalog.pg_type AS type_state
        CROSS JOIN LATERAL pg_catalog.aclexplode(
            CASE
                WHEN pg_catalog.array_ndims(
                    type_state.typacl
                ) = 1 THEN type_state.typacl
                ELSE NULL::pg_catalog.aclitem[]
            END
        ) AS acl_entry
    ) AS direct_privileges
    WHERE direct_privileges.grantee = ANY (target_role_oids);

    IF direct_privilege_count <> 1 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15A verification failed: temporary bootstrap privilege contract mismatch',
            detail = pg_catalog.format(
                'Expected 1 temporary schema privilege, found %s',
                direct_privilege_count
            );
    END IF;

    RAISE NOTICE 'P2D15G_170_P2D15A_VERIFICATION_OK';
END
$verification$;

WITH target_roles AS (
    SELECT
        role_state.oid,
        role_state.rolname,
        role_state.rolcanlogin,
        role_state.rolinherit,
        role_state.rolsuper,
        role_state.rolcreatedb,
        role_state.rolcreaterole,
        role_state.rolreplication,
        role_state.rolbypassrls,
        role_state.rolpassword
    FROM pg_catalog.pg_authid AS role_state
    WHERE role_state.rolname = ANY (ARRAY[
        'afex_core_owner',
        'afex_core_runtime',
        'afex_context_issuer',
        'afex_outbox_worker',
        'afex_function_owner'
    ])
)
SELECT
    target_roles.rolname AS role_name,
    true AS exists,
    target_roles.rolcanlogin AS can_login,
    target_roles.rolinherit AS inherit,
    target_roles.rolsuper AS superuser,
    target_roles.rolcreatedb AS create_db,
    target_roles.rolcreaterole AS create_role,
    target_roles.rolreplication AS replication,
    target_roles.rolbypassrls AS bypass_rls,
    target_roles.rolpassword IS NULL AS password_is_null,
    COALESCE(
        (
            SELECT setting_state.setconfig
            FROM pg_catalog.pg_db_role_setting AS setting_state
            WHERE setting_state.setrole = target_roles.oid
              AND setting_state.setdatabase = 0
        ),
        NULL::text[]
    ) AS role_config,
    (
        SELECT count(*)
        FROM pg_catalog.pg_auth_members AS membership
        WHERE membership.roleid = target_roles.oid
           OR membership.member = target_roles.oid
    ) AS membership_count,
    (
        SELECT pg_catalog.jsonb_agg(
            pg_catalog.jsonb_strip_nulls(
                pg_catalog.jsonb_build_object(
                    'admin_option',
                    pg_catalog.to_jsonb(membership)->'admin_option',
                    'inherit_option',
                    pg_catalog.to_jsonb(membership)->'inherit_option',
                    'set_option',
                    pg_catalog.to_jsonb(membership)->'set_option'
                )
            )
            ORDER BY membership.grantor
        )
        FROM pg_catalog.pg_auth_members AS membership
        WHERE membership.roleid = target_roles.oid
          AND membership.member = (
              SELECT role_state.oid
              FROM pg_catalog.pg_roles AS role_state
              WHERE role_state.rolname = CURRENT_USER
          )
    ) AS membership_options,
    (
        SELECT count(*)
        FROM (
            SELECT namespace_state.oid
            FROM pg_catalog.pg_namespace AS namespace_state
            WHERE namespace_state.nspowner = target_roles.oid

            UNION ALL

            SELECT relation_state.oid
            FROM pg_catalog.pg_class AS relation_state
            WHERE relation_state.relowner = target_roles.oid
              AND relation_state.relkind IN (
                  'r',
                  'p',
                  'S',
                  'v',
                  'm',
                  'f'
              )

            UNION ALL

            SELECT routine_state.oid
            FROM pg_catalog.pg_proc AS routine_state
            WHERE routine_state.proowner = target_roles.oid
              AND routine_state.prokind IN ('f', 'p')

            UNION ALL

            SELECT type_state.oid
            FROM pg_catalog.pg_type AS type_state
            WHERE type_state.typowner = target_roles.oid
              AND type_state.typtype IN ('c', 'd', 'e', 'r', 'm')
        ) AS owned_objects
    ) AS owned_object_count,
    (
        SELECT count(*)
        FROM pg_catalog.pg_default_acl AS default_acl
        WHERE default_acl.defaclrole = target_roles.oid
           OR EXISTS (
              SELECT 1
              FROM pg_catalog.aclexplode(
                  CASE
                      WHEN pg_catalog.array_ndims(
                          default_acl.defaclacl
                      ) = 1 THEN default_acl.defaclacl
                      ELSE NULL::pg_catalog.aclitem[]
                  END
              ) AS acl_entry
              WHERE acl_entry.grantee = target_roles.oid
           )
    ) AS default_acl_participation_count
FROM target_roles
ORDER BY target_roles.rolname;

-- END OF P2D.15A FRESH SECURITY ROLES FOUNDATION

-- P2D.15B — Fresh Authorization Context Foundation
-- STATUS: DRAFT

DO $diagnostic$ BEGIN RAISE NOTICE 'P2D15G_200_P2D15B_BEGIN'; END $diagnostic$;

DO $preflight$
DECLARE
    missing_dependencies text[];
    invalid_dependencies text[];
BEGIN
    IF pg_catalog.to_regclass(
        'public.atomic_authorization_contexts'
    ) IS NOT NULL THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15B preflight failed: target relation already exists',
            detail = 'public.atomic_authorization_contexts';
    END IF;

    SELECT pg_catalog.array_agg(required_role.role_name ORDER BY required_role.role_name)
    INTO missing_dependencies
    FROM (
        VALUES
            ('afex_core_owner'),
            ('afex_core_runtime'),
            ('afex_context_issuer'),
            ('afex_outbox_worker'),
            ('afex_function_owner')
    ) AS required_role(role_name)
    WHERE NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_roles AS role_state
        WHERE role_state.rolname = required_role.role_name
    );

    IF missing_dependencies IS NOT NULL THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15B preflight failed: required roles are missing',
            detail = pg_catalog.array_to_string(missing_dependencies, ', ');
    END IF;

    SELECT pg_catalog.array_agg(
        required_relation.relation_name
        ORDER BY required_relation.relation_name
    )
    INTO missing_dependencies
    FROM (
        VALUES
            ('public.tenants'),
            ('public.branches'),
            ('public.profiles')
    ) AS required_relation(relation_name)
    WHERE pg_catalog.to_regclass(required_relation.relation_name) IS NULL;

    IF missing_dependencies IS NOT NULL THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15B preflight failed: required relations are missing',
            detail = pg_catalog.array_to_string(missing_dependencies, ', ');
    END IF;

    SELECT pg_catalog.array_agg(
        required_identity.relation_name || '.' || required_identity.column_name
        ORDER BY required_identity.relation_name
    )
    INTO invalid_dependencies
    FROM (
        VALUES
            ('public.tenants', 'id'),
            ('public.branches', 'id'),
            ('public.profiles', 'id')
    ) AS required_identity(relation_name, column_name)
    WHERE NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute AS attribute_state
        WHERE attribute_state.attrelid =
              pg_catalog.to_regclass(required_identity.relation_name)
          AND attribute_state.attname = required_identity.column_name
          AND attribute_state.attnum > 0
          AND NOT attribute_state.attisdropped
          AND pg_catalog.format_type(
              attribute_state.atttypid,
              attribute_state.atttypmod
          ) = 'uuid'
          AND attribute_state.attnotnull
    );

    IF invalid_dependencies IS NOT NULL THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15B preflight failed: required identity columns are invalid',
            detail = pg_catalog.array_to_string(invalid_dependencies, ', ');
    END IF;
END
$preflight$;

CREATE TABLE public.atomic_authorization_contexts (
    id uuid NOT NULL,
    context_version smallint NOT NULL,
    authenticated_actor_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    role_snapshot text NOT NULL,
    capability_version bigint NOT NULL,
    employee_source text NOT NULL,
    employee_source_id uuid,
    command_type text NOT NULL,
    idempotency_key_hash bytea NOT NULL,
    request_fingerprint bytea NOT NULL,
    fingerprint_version smallint NOT NULL,
    reference_hash bytea NOT NULL,
    correlation_reference text NOT NULL,
    issued_at timestamp with time zone NOT NULL
        DEFAULT pg_catalog.transaction_timestamp(),
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    revocation_code text,
    consumed_at timestamp with time zone,
    consumed_command_id uuid,
    consumption_kind text,
    created_by_identity text NOT NULL,
    CONSTRAINT atomic_authorization_contexts_pkey
        PRIMARY KEY (id),
    CONSTRAINT atomic_authorization_contexts_reference_hash_key
        UNIQUE (reference_hash),
    CONSTRAINT atomic_authorization_contexts_actor_fk
        FOREIGN KEY (authenticated_actor_id)
        REFERENCES public.profiles (id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    CONSTRAINT atomic_authorization_contexts_tenant_fk
        FOREIGN KEY (tenant_id)
        REFERENCES public.tenants (id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    CONSTRAINT atomic_authorization_contexts_branch_fk
        FOREIGN KEY (branch_id)
        REFERENCES public.branches (id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    CONSTRAINT atomic_authorization_contexts_context_version_check
        CHECK (context_version > 0),
    CONSTRAINT atomic_authorization_contexts_command_type_check
        CHECK (command_type = 'order.create'),
    CONSTRAINT atomic_authorization_contexts_role_snapshot_check
        CHECK (
            role_snapshot = ANY (
                ARRAY[
                    'admin'::text,
                    'manager'::text,
                    'employee'::text,
                    'cashier'::text
                ]
            )
        ),
    CONSTRAINT atomic_authorization_contexts_capability_version_check
        CHECK (capability_version > 0),
    CONSTRAINT atomic_authorization_contexts_employee_source_check
        CHECK (
            employee_source = ANY (
                ARRAY[
                    'profile'::text,
                    'pos_profile'::text,
                    'none'::text
                ]
            )
        ),
    CONSTRAINT atomic_authorization_contexts_employee_identity_check
        CHECK (
            (
                employee_source = 'none'
                AND employee_source_id IS NULL
            )
            OR
            (
                employee_source = ANY (
                    ARRAY['profile'::text, 'pos_profile'::text]
                )
                AND employee_source_id IS NOT NULL
            )
        ),
    CONSTRAINT atomic_authorization_contexts_idempotency_hash_check
        CHECK (pg_catalog.octet_length(idempotency_key_hash) = 32),
    CONSTRAINT atomic_authorization_contexts_request_fingerprint_check
        CHECK (pg_catalog.octet_length(request_fingerprint) = 32),
    CONSTRAINT atomic_authorization_contexts_fingerprint_version_check
        CHECK (fingerprint_version > 0),
    CONSTRAINT atomic_authorization_contexts_reference_hash_check
        CHECK (pg_catalog.octet_length(reference_hash) = 32),
    CONSTRAINT atomic_authorization_contexts_correlation_reference_check
        CHECK (
            pg_catalog.char_length(correlation_reference)
            BETWEEN 1 AND 128
        ),
    CONSTRAINT atomic_authorization_contexts_created_by_identity_check
        CHECK (
            pg_catalog.char_length(created_by_identity)
            BETWEEN 1 AND 128
        ),
    CONSTRAINT atomic_authorization_contexts_ttl_check
        CHECK (
            expires_at = issued_at + interval '120 seconds'
        ),
    CONSTRAINT atomic_authorization_contexts_revocation_check
        CHECK (
            (revoked_at IS NULL AND revocation_code IS NULL)
            OR
            (
                revoked_at IS NOT NULL
                AND revoked_at >= issued_at
                AND pg_catalog.char_length(revocation_code)
                    BETWEEN 1 AND 64
            )
        ),
    CONSTRAINT atomic_authorization_contexts_consumption_check
        CHECK (
            (
                consumed_at IS NULL
                AND consumed_command_id IS NULL
                AND consumption_kind IS NULL
            )
            OR
            (
                consumed_at IS NOT NULL
                AND consumed_at >= issued_at
                AND consumed_command_id IS NOT NULL
                AND consumption_kind = ANY (
                    ARRAY['execution'::text, 'replay'::text]
                )
            )
        ),
    CONSTRAINT atomic_authorization_contexts_terminal_state_check
        CHECK (NOT (revoked_at IS NOT NULL AND consumed_at IS NOT NULL))
);

DO $diagnostic$ BEGIN RAISE NOTICE 'P2D15G_210_CONTEXT_TABLE_CREATED'; END $diagnostic$;

DO $ownership_prerequisites$
DECLARE
    installation_role_oid oid;
    core_owner_oid oid;
    target_role_oids oid[];
    automatic_grantor_oid oid;
    public_schema_oid oid;
BEGIN
    SELECT role_state.oid
    INTO installation_role_oid
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname = CURRENT_USER;

    SELECT role_state.oid
    INTO core_owner_oid
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname = 'afex_core_owner';

    SELECT pg_catalog.array_agg(role_state.oid ORDER BY role_state.rolname)
    INTO target_role_oids
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname = ANY (ARRAY[
        'afex_core_owner',
        'afex_core_runtime',
        'afex_context_issuer',
        'afex_outbox_worker',
        'afex_function_owner'
    ]);

    SELECT
        (pg_catalog.array_agg(
            DISTINCT membership.grantor
            ORDER BY membership.grantor
        ))[1]
    INTO automatic_grantor_oid
    FROM pg_catalog.pg_auth_members AS membership
    WHERE membership.roleid = ANY (target_role_oids)
      AND membership.member = installation_role_oid
      AND membership.grantor <> installation_role_oid
      AND membership.admin_option
      AND NOT membership.inherit_option
      AND NOT membership.set_option;

    SELECT namespace_state.oid
    INTO public_schema_oid
    FROM pg_catalog.pg_namespace AS namespace_state
    WHERE namespace_state.nspname = 'public';

    IF installation_role_oid IS NULL
       OR core_owner_oid IS NULL
       OR automatic_grantor_oid IS NULL
       OR automatic_grantor_oid = installation_role_oid
       OR public_schema_oid IS NULL
       OR pg_catalog.cardinality(target_role_oids) <> 5
       OR NOT pg_catalog.pg_has_role(
            installation_role_oid,
            core_owner_oid,
            'SET'
       )
       OR NOT pg_catalog.has_schema_privilege(
            core_owner_oid,
            public_schema_oid,
            'CREATE'
       )
       OR NOT pg_catalog.has_schema_privilege(
            core_owner_oid,
            public_schema_oid,
            'USAGE'
       )
       OR (
            SELECT pg_catalog.count(*)
            FROM pg_catalog.pg_auth_members AS membership
            WHERE membership.roleid = ANY (target_role_oids)
               OR membership.member = ANY (target_role_oids)
       ) <> 6
       OR EXISTS (
            SELECT 1
            FROM unnest(target_role_oids) AS target_role(role_oid)
            WHERE (
                SELECT pg_catalog.count(*)
                FROM pg_catalog.pg_auth_members AS membership
                WHERE membership.roleid = target_role.role_oid
                  AND membership.member = installation_role_oid
            ) <> CASE
                WHEN target_role.role_oid = core_owner_oid THEN 2
                ELSE 1
            END
       )
       OR (
            SELECT pg_catalog.count(*)
            FROM pg_catalog.pg_auth_members AS membership
            WHERE membership.roleid = core_owner_oid
              AND membership.member = installation_role_oid
              AND membership.grantor = automatic_grantor_oid
              AND membership.admin_option
              AND NOT membership.inherit_option
              AND NOT membership.set_option
       ) <> 1
       OR (
            SELECT pg_catalog.count(*)
            FROM pg_catalog.pg_auth_members AS membership
            WHERE membership.roleid = ANY (target_role_oids)
              AND membership.member = installation_role_oid
              AND membership.grantor = automatic_grantor_oid
              AND membership.member <> ALL (target_role_oids)
              AND membership.admin_option
              AND NOT membership.inherit_option
              AND NOT membership.set_option
       ) <> 5
       OR (
            SELECT pg_catalog.count(*)
            FROM pg_catalog.pg_auth_members AS membership
            WHERE membership.roleid = core_owner_oid
              AND membership.member = installation_role_oid
              AND membership.grantor = installation_role_oid
              AND NOT membership.admin_option
              AND NOT membership.inherit_option
              AND membership.set_option
       ) <> 1
       OR EXISTS (
            SELECT 1
            FROM pg_catalog.pg_auth_members AS membership
            WHERE membership.member = ANY (target_role_oids)
       )
       OR EXISTS (
            SELECT 1
            FROM pg_catalog.aclexplode(
                CASE
                    WHEN pg_catalog.array_ndims(
                        (
                            SELECT namespace_state.nspacl
                            FROM pg_catalog.pg_namespace AS namespace_state
                            WHERE namespace_state.oid = public_schema_oid
                        )
                    ) = 1 THEN (
                        SELECT namespace_state.nspacl
                        FROM pg_catalog.pg_namespace AS namespace_state
                        WHERE namespace_state.oid = public_schema_oid
                    )
                    ELSE NULL::pg_catalog.aclitem[]
                END
            ) AS acl_state
            WHERE acl_state.grantee = ANY (target_role_oids)
              AND (
                  acl_state.grantee <> core_owner_oid
                  OR acl_state.privilege_type <> 'CREATE'
                  OR acl_state.is_grantable
              )
       ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15B ownership-transfer prerequisites failed';
    END IF;
END
$ownership_prerequisites$;

DO $diagnostic$ BEGIN RAISE NOTICE 'P2D15P_241_OWNERSHIP_PREREQUISITES_OK'; END $diagnostic$;

ALTER TABLE public.atomic_authorization_contexts
    OWNER TO afex_core_owner;

DO $context_ownership_verification$
BEGIN
    IF (
        SELECT owner_role.rolname
        FROM pg_catalog.pg_class AS relation_state
        JOIN pg_catalog.pg_roles AS owner_role
          ON owner_role.oid = relation_state.relowner
        WHERE relation_state.oid =
              pg_catalog.to_regclass(
                  'public.atomic_authorization_contexts'
              )
    ) IS DISTINCT FROM 'afex_core_owner' THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15B context ownership transfer failed';
    END IF;
END
$context_ownership_verification$;

DO $diagnostic$ BEGIN RAISE NOTICE 'P2D15P_242_CONTEXT_OWNERSHIP_OK'; END $diagnostic$;

SET LOCAL ROLE afex_core_owner;

CREATE INDEX atomic_authorization_contexts_expiry_idx
    ON public.atomic_authorization_contexts (expires_at, id)
    WHERE consumed_at IS NULL
      AND revoked_at IS NULL;

CREATE INDEX atomic_authorization_contexts_actor_scope_idx
    ON public.atomic_authorization_contexts (
        authenticated_actor_id,
        tenant_id,
        branch_id,
        issued_at DESC
    );

CREATE INDEX atomic_authorization_contexts_employee_identity_idx
    ON public.atomic_authorization_contexts (
        tenant_id,
        branch_id,
        employee_source,
        employee_source_id
    )
    WHERE employee_source_id IS NOT NULL;

CREATE INDEX atomic_authorization_contexts_consumed_command_idx
    ON public.atomic_authorization_contexts (consumed_command_id)
    WHERE consumed_command_id IS NOT NULL;

DO $diagnostic$ BEGIN RAISE NOTICE 'P2D15G_220_CONTEXT_CONSTRAINTS_INDEXES_OK'; END $diagnostic$;

ALTER TABLE public.atomic_authorization_contexts
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.atomic_authorization_contexts
    FORCE ROW LEVEL SECURITY;

CREATE POLICY atomic_authorization_contexts_owner_all
    ON public.atomic_authorization_contexts
    AS PERMISSIVE
    FOR ALL
    TO afex_core_owner
    USING (true)
    WITH CHECK (true);

DO $diagnostic$ BEGIN RAISE NOTICE 'P2D15G_230_CONTEXT_RLS_POLICY_OK'; END $diagnostic$;

REVOKE ALL PRIVILEGES
    ON TABLE public.atomic_authorization_contexts
    FROM PUBLIC;

REVOKE ALL PRIVILEGES
    ON TABLE public.atomic_authorization_contexts
    FROM anon;

REVOKE ALL PRIVILEGES
    ON TABLE public.atomic_authorization_contexts
    FROM authenticated;

REVOKE ALL PRIVILEGES
    ON TABLE public.atomic_authorization_contexts
    FROM service_role;

REVOKE ALL PRIVILEGES
    ON TABLE public.atomic_authorization_contexts
    FROM afex_core_runtime;

REVOKE ALL PRIVILEGES
    ON TABLE public.atomic_authorization_contexts
    FROM afex_context_issuer;

REVOKE ALL PRIVILEGES
    ON TABLE public.atomic_authorization_contexts
    FROM afex_outbox_worker;

REVOKE ALL PRIVILEGES
    ON TABLE public.atomic_authorization_contexts
    FROM afex_function_owner;

DO $diagnostic$ BEGIN RAISE NOTICE 'P2D15U_231_CONTEXT_DEFAULT_ACL_CLOSED'; END $diagnostic$;

DO $verification$
DECLARE
    target_relation oid;
    verification_failure_count integer;
BEGIN
    SELECT relation_state.oid
    INTO target_relation
    FROM pg_catalog.pg_class AS relation_state
    JOIN pg_catalog.pg_namespace AS namespace_state
      ON namespace_state.oid = relation_state.relnamespace
    WHERE namespace_state.nspname = 'public'
      AND relation_state.relname = 'atomic_authorization_contexts'
      AND relation_state.relkind = 'r';

    IF target_relation IS NULL THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15B verification failed: target table is missing';
    END IF;

    IF (
        SELECT owner_role.rolname
        FROM pg_catalog.pg_class AS relation_state
        JOIN pg_catalog.pg_roles AS owner_role
          ON owner_role.oid = relation_state.relowner
        WHERE relation_state.oid = target_relation
    ) IS DISTINCT FROM 'afex_core_owner' THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15B verification failed: table owner is invalid';
    END IF;

    SELECT pg_catalog.count(*)
    INTO verification_failure_count
    FROM (
        VALUES
            ('id', 'uuid', true, NULL::text),
            ('context_version', 'smallint', true, NULL::text),
            ('authenticated_actor_id', 'uuid', true, NULL::text),
            ('tenant_id', 'uuid', true, NULL::text),
            ('branch_id', 'uuid', true, NULL::text),
            ('role_snapshot', 'text', true, NULL::text),
            ('capability_version', 'bigint', true, NULL::text),
            ('employee_source', 'text', true, NULL::text),
            ('employee_source_id', 'uuid', false, NULL::text),
            ('command_type', 'text', true, NULL::text),
            ('idempotency_key_hash', 'bytea', true, NULL::text),
            ('request_fingerprint', 'bytea', true, NULL::text),
            ('fingerprint_version', 'smallint', true, NULL::text),
            ('reference_hash', 'bytea', true, NULL::text),
            ('correlation_reference', 'text', true, NULL::text),
            (
                'issued_at',
                'timestamp with time zone',
                true,
                'transaction_timestamp()'
            ),
            ('expires_at', 'timestamp with time zone', true, NULL::text),
            ('revoked_at', 'timestamp with time zone', false, NULL::text),
            ('revocation_code', 'text', false, NULL::text),
            ('consumed_at', 'timestamp with time zone', false, NULL::text),
            ('consumed_command_id', 'uuid', false, NULL::text),
            ('consumption_kind', 'text', false, NULL::text),
            ('created_by_identity', 'text', true, NULL::text)
    ) AS expected_column(
        column_name,
        formatted_type,
        required_not_null,
        default_expression
    )
    WHERE NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute AS attribute_state
        LEFT JOIN pg_catalog.pg_attrdef AS default_state
          ON default_state.adrelid = attribute_state.attrelid
         AND default_state.adnum = attribute_state.attnum
        WHERE attribute_state.attrelid = target_relation
          AND attribute_state.attname = expected_column.column_name
          AND attribute_state.attnum > 0
          AND NOT attribute_state.attisdropped
          AND pg_catalog.format_type(
              attribute_state.atttypid,
              attribute_state.atttypmod
          ) = expected_column.formatted_type
          AND attribute_state.attnotnull =
              expected_column.required_not_null
          AND pg_catalog.pg_get_expr(
              default_state.adbin,
              default_state.adrelid
          ) IS NOT DISTINCT FROM expected_column.default_expression
    );

    IF verification_failure_count <> 0 OR (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_attribute AS attribute_state
        WHERE attribute_state.attrelid = target_relation
          AND attribute_state.attnum > 0
          AND NOT attribute_state.attisdropped
    ) <> 23 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15B verification failed: column contract mismatch',
            detail = pg_catalog.format(
                'Missing or invalid columns: %s',
                verification_failure_count
            );
    END IF;

    SELECT pg_catalog.count(*)
    INTO verification_failure_count
    FROM (
        VALUES
            (
                'atomic_authorization_contexts_pkey',
                'p'::"char"
            ),
            (
                'atomic_authorization_contexts_reference_hash_key',
                'u'::"char"
            ),
            (
                'atomic_authorization_contexts_actor_fk',
                'f'::"char"
            ),
            (
                'atomic_authorization_contexts_tenant_fk',
                'f'::"char"
            ),
            (
                'atomic_authorization_contexts_branch_fk',
                'f'::"char"
            ),
            (
                'atomic_authorization_contexts_context_version_check',
                'c'::"char"
            ),
            (
                'atomic_authorization_contexts_command_type_check',
                'c'::"char"
            ),
            (
                'atomic_authorization_contexts_role_snapshot_check',
                'c'::"char"
            ),
            (
                'atomic_authorization_contexts_capability_version_check',
                'c'::"char"
            ),
            (
                'atomic_authorization_contexts_employee_source_check',
                'c'::"char"
            ),
            (
                'atomic_authorization_contexts_employee_identity_check',
                'c'::"char"
            ),
            (
                'atomic_authorization_contexts_idempotency_hash_check',
                'c'::"char"
            ),
            (
                'atomic_authorization_contexts_request_fingerprint_check',
                'c'::"char"
            ),
            (
                'atomic_authorization_contexts_fingerprint_version_check',
                'c'::"char"
            ),
            (
                'atomic_authorization_contexts_reference_hash_check',
                'c'::"char"
            ),
            (
                'atomic_authorization_contexts_correlation_reference_check',
                'c'::"char"
            ),
            (
                'atomic_authorization_contexts_created_by_identity_check',
                'c'::"char"
            ),
            (
                'atomic_authorization_contexts_ttl_check',
                'c'::"char"
            ),
            (
                'atomic_authorization_contexts_revocation_check',
                'c'::"char"
            ),
            (
                'atomic_authorization_contexts_consumption_check',
                'c'::"char"
            ),
            (
                'atomic_authorization_contexts_terminal_state_check',
                'c'::"char"
            )
    ) AS expected_constraint(constraint_name, constraint_type)
    WHERE NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint AS constraint_state
        WHERE constraint_state.conrelid = target_relation
          AND constraint_state.conname =
              expected_constraint.constraint_name
          AND constraint_state.contype =
              expected_constraint.constraint_type
          AND constraint_state.convalidated
    );

    IF verification_failure_count <> 0 OR (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_constraint AS constraint_state
        WHERE constraint_state.conrelid = target_relation
    ) <> 21 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15B verification failed: constraint contract mismatch',
            detail = pg_catalog.format(
                'Missing or invalid constraints: %s',
                verification_failure_count
            );
    END IF;

    SELECT pg_catalog.count(*)
    INTO verification_failure_count
    FROM (
        VALUES
            ('atomic_authorization_contexts_pkey', true, true),
            (
                'atomic_authorization_contexts_reference_hash_key',
                true,
                false
            ),
            (
                'atomic_authorization_contexts_expiry_idx',
                false,
                false
            ),
            (
                'atomic_authorization_contexts_actor_scope_idx',
                false,
                false
            ),
            (
                'atomic_authorization_contexts_employee_identity_idx',
                false,
                false
            ),
            (
                'atomic_authorization_contexts_consumed_command_idx',
                false,
                false
            )
    ) AS expected_index(index_name, is_unique, is_primary)
    WHERE NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_index AS index_state
        JOIN pg_catalog.pg_class AS index_relation
          ON index_relation.oid = index_state.indexrelid
        WHERE index_state.indrelid = target_relation
          AND index_relation.relname = expected_index.index_name
          AND index_state.indisunique = expected_index.is_unique
          AND index_state.indisprimary = expected_index.is_primary
          AND index_state.indisvalid
          AND index_state.indisready
          AND index_state.indislive
    );

    IF verification_failure_count <> 0 OR (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_index AS index_state
        WHERE index_state.indrelid = target_relation
    ) <> 6 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15B verification failed: index contract mismatch',
            detail = pg_catalog.format(
                'Missing or invalid indexes: %s',
                verification_failure_count
            );
    END IF;

    IF NOT (
        SELECT relation_state.relrowsecurity
               AND relation_state.relforcerowsecurity
        FROM pg_catalog.pg_class AS relation_state
        WHERE relation_state.oid = target_relation
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15B verification failed: RLS contract mismatch';
    END IF;

    IF (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_policy AS policy_state
        WHERE policy_state.polrelid = target_relation
          AND policy_state.polname =
              'atomic_authorization_contexts_owner_all'
          AND policy_state.polcmd = '*'
          AND policy_state.polpermissive
          AND policy_state.polroles = ARRAY[
              (
                  SELECT role_state.oid
                  FROM pg_catalog.pg_roles AS role_state
                  WHERE role_state.rolname = 'afex_core_owner'
              )
          ]::oid[]
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
        WHERE policy_state.polrelid = target_relation
    ) <> 1 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15B verification failed: bootstrap policy contract mismatch';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class AS relation_state
        CROSS JOIN LATERAL pg_catalog.aclexplode(
            CASE
                WHEN pg_catalog.array_ndims(
                    relation_state.relacl
                ) = 1 THEN relation_state.relacl
                ELSE NULL::pg_catalog.aclitem[]
            END
        ) AS acl_state
        WHERE relation_state.oid = target_relation
          AND acl_state.grantee <> (
            SELECT role_state.oid
            FROM pg_catalog.pg_roles AS role_state
            WHERE role_state.rolname = 'afex_core_owner'
        )
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15B verification failed: unexpected direct table privilege';
    END IF;

    RAISE NOTICE 'P2D15G_240_P2D15B_VERIFICATION_OK';
END
$verification$;

SELECT
    owner_role.rolname AS table_owner,
    relation_state.relrowsecurity AS rls_enabled,
    relation_state.relforcerowsecurity AS force_rls_enabled,
    (
        SELECT pg_catalog.count(*)
        FROM public.atomic_authorization_contexts
    ) AS row_count,
    (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_policy AS policy_state
        WHERE policy_state.polrelid = relation_state.oid
    ) AS policy_count
FROM pg_catalog.pg_class AS relation_state
JOIN pg_catalog.pg_namespace AS namespace_state
  ON namespace_state.oid = relation_state.relnamespace
JOIN pg_catalog.pg_roles AS owner_role
  ON owner_role.oid = relation_state.relowner
WHERE namespace_state.nspname = 'public'
  AND relation_state.relname = 'atomic_authorization_contexts'
  AND relation_state.relkind = 'r';

RESET ROLE;

-- END OF P2D.15B FRESH AUTHORIZATION CONTEXT FOUNDATION

-- P2D.15C — Fresh Atomic Command Foundation
-- STATUS: DRAFT — DO NOT EXECUTE BEFORE EXTERNAL REVIEW
-- Production preflight classification: NOT_INSTALLED
-- Manual execution only after ChatGPT review

DO $diagnostic$ BEGIN RAISE NOTICE 'P2D15G_300_P2D15C_BEGIN'; END $diagnostic$;

DO $preflight$
DECLARE
    missing_roles text[];
    invalid_dependencies text[];
    context_relation oid;
BEGIN
    SELECT pg_catalog.array_agg(
        required_role.role_name
        ORDER BY required_role.role_name
    )
    INTO missing_roles
    FROM (
        VALUES
            ('afex_core_owner'),
            ('afex_core_runtime'),
            ('afex_context_issuer'),
            ('afex_outbox_worker'),
            ('afex_function_owner')
    ) AS required_role(role_name)
    WHERE NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_roles AS role_state
        WHERE role_state.rolname = required_role.role_name
    );

    IF missing_roles IS NOT NULL THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15C preflight failed: required roles are missing',
            detail = pg_catalog.array_to_string(missing_roles, ', ');
    END IF;

    SELECT relation_state.oid
    INTO context_relation
    FROM pg_catalog.pg_class AS relation_state
    JOIN pg_catalog.pg_namespace AS namespace_state
      ON namespace_state.oid = relation_state.relnamespace
    WHERE namespace_state.nspname = 'public'
      AND relation_state.relname = 'atomic_authorization_contexts'
      AND relation_state.relkind = 'r';

    IF context_relation IS NULL THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15C preflight failed: authorization context table is missing';
    END IF;

    IF (
        SELECT owner_role.rolname
        FROM pg_catalog.pg_class AS relation_state
        JOIN pg_catalog.pg_roles AS owner_role
          ON owner_role.oid = relation_state.relowner
        WHERE relation_state.oid = context_relation
    ) IS DISTINCT FROM 'afex_core_owner' THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15C preflight failed: authorization context owner is invalid';
    END IF;

    IF NOT (
        SELECT relation_state.relrowsecurity
               AND relation_state.relforcerowsecurity
        FROM pg_catalog.pg_class AS relation_state
        WHERE relation_state.oid = context_relation
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15C preflight failed: authorization context RLS state is invalid';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.atomic_authorization_contexts
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15C preflight failed: authorization context table is not empty';
    END IF;

    IF pg_catalog.to_regclass('public.atomic_order_commands') IS NOT NULL THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15C preflight failed: target relation already exists',
            detail = 'public.atomic_order_commands';
    END IF;

    IF pg_catalog.to_regclass('public.idempotency_commands') IS NOT NULL THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15C preflight failed: superseded idempotency object exists',
            detail = 'public.idempotency_commands';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint AS constraint_state
        WHERE constraint_state.conrelid = context_relation
          AND constraint_state.contype = 'f'
          AND constraint_state.conkey = ARRAY[
              (
                  SELECT attribute_state.attnum
                  FROM pg_catalog.pg_attribute AS attribute_state
                  WHERE attribute_state.attrelid = context_relation
                    AND attribute_state.attname = 'consumed_command_id'
                    AND attribute_state.attnum > 0
                    AND NOT attribute_state.attisdropped
              )
          ]::smallint[]
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15C preflight failed: consumed-command foreign key already exists';
    END IF;

    SELECT pg_catalog.array_agg(
        expected_column.column_name
        ORDER BY expected_column.column_name
    )
    INTO invalid_dependencies
    FROM (
        VALUES
            ('id', 'uuid'),
            ('consumed_command_id', 'uuid'),
            ('consumption_kind', 'text')
    ) AS expected_column(column_name, formatted_type)
    WHERE NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute AS attribute_state
        WHERE attribute_state.attrelid = context_relation
          AND attribute_state.attname = expected_column.column_name
          AND attribute_state.attnum > 0
          AND NOT attribute_state.attisdropped
          AND pg_catalog.format_type(
              attribute_state.atttypid,
              attribute_state.atttypmod
          ) = expected_column.formatted_type
    );

    IF invalid_dependencies IS NOT NULL THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15C preflight failed: authorization context columns are invalid',
            detail = pg_catalog.array_to_string(invalid_dependencies, ', ');
    END IF;

    SELECT pg_catalog.array_agg(
        expected_target.relation_name || '.id'
        ORDER BY expected_target.relation_name
    )
    INTO invalid_dependencies
    FROM (
        VALUES
            ('public.tenants'),
            ('public.branches'),
            ('public.profiles'),
            ('public.orders'),
            ('public.invoices')
    ) AS expected_target(relation_name)
    WHERE pg_catalog.to_regclass(expected_target.relation_name) IS NULL
       OR NOT EXISTS (
          SELECT 1
          FROM pg_catalog.pg_attribute AS attribute_state
          WHERE attribute_state.attrelid =
                pg_catalog.to_regclass(expected_target.relation_name)
            AND attribute_state.attname = 'id'
            AND attribute_state.attnum > 0
            AND NOT attribute_state.attisdropped
            AND pg_catalog.format_type(
                attribute_state.atttypid,
                attribute_state.atttypmod
            ) = 'uuid'
       )
       OR NOT EXISTS (
          SELECT 1
          FROM pg_catalog.pg_constraint AS constraint_state
          JOIN pg_catalog.pg_attribute AS attribute_state
            ON attribute_state.attrelid = constraint_state.conrelid
           AND attribute_state.attnum = constraint_state.conkey[1]
          WHERE constraint_state.conrelid =
                pg_catalog.to_regclass(expected_target.relation_name)
            AND constraint_state.contype IN ('p', 'u')
            AND constraint_state.convalidated
            AND pg_catalog.array_length(
                constraint_state.conkey,
                1
            ) = 1
            AND attribute_state.attname = 'id'
       );

    IF invalid_dependencies IS NOT NULL THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15C preflight failed: referenced identity contracts are invalid',
            detail = pg_catalog.array_to_string(invalid_dependencies, ', ');
    END IF;
END
$preflight$;

CREATE TABLE public.atomic_order_commands (
    id uuid NOT NULL,
    command_version smallint NOT NULL,
    command_type text NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    idempotency_key_hash bytea NOT NULL,
    request_fingerprint bytea NOT NULL,
    fingerprint_version smallint NOT NULL,
    authorization_context_id uuid NOT NULL,
    authenticated_actor_id uuid NOT NULL,
    correlation_reference text NOT NULL,
    engine_version smallint NOT NULL,
    execution_status text NOT NULL,
    -- lease_owner is the independently generated execution_attempt_id.
    -- It is not a database role, host, process, session, token, or secret.
    lease_owner uuid,
    lease_expires_at timestamp with time zone,
    attempt_count integer NOT NULL DEFAULT 0,
    order_id uuid,
    invoice_id uuid,
    order_number text,
    response_version text,
    response_snapshot jsonb,
    error_code text,
    error_detail text,
    last_failure_stage text,
    first_started_at timestamp with time zone,
    last_started_at timestamp with time zone,
    completed_at timestamp with time zone,
    failed_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL
        DEFAULT pg_catalog.transaction_timestamp(),
    updated_at timestamp with time zone NOT NULL
        DEFAULT pg_catalog.transaction_timestamp(),
    created_by_identity text NOT NULL,
    command_retain_until timestamp with time zone,
    response_retain_until timestamp with time zone,
    CONSTRAINT atomic_order_commands_pkey
        PRIMARY KEY (id),
    CONSTRAINT atomic_order_commands_scoped_idempotency_key
        UNIQUE (
            tenant_id,
            branch_id,
            command_type,
            idempotency_key_hash
        ),
    CONSTRAINT atomic_order_commands_authorization_context_key
        UNIQUE (authorization_context_id),
    CONSTRAINT atomic_order_commands_tenant_fk
        FOREIGN KEY (tenant_id)
        REFERENCES public.tenants (id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    CONSTRAINT atomic_order_commands_branch_fk
        FOREIGN KEY (branch_id)
        REFERENCES public.branches (id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    CONSTRAINT atomic_order_commands_actor_fk
        FOREIGN KEY (authenticated_actor_id)
        REFERENCES public.profiles (id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    CONSTRAINT atomic_order_commands_order_fk
        FOREIGN KEY (order_id)
        REFERENCES public.orders (id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    CONSTRAINT atomic_order_commands_invoice_fk
        FOREIGN KEY (invoice_id)
        REFERENCES public.invoices (id)
        ON UPDATE RESTRICT
        ON DELETE RESTRICT,
    CONSTRAINT atomic_order_commands_command_version_check
        CHECK (command_version > 0),
    CONSTRAINT atomic_order_commands_command_type_check
        CHECK (command_type = 'order.create'),
    CONSTRAINT atomic_order_commands_idempotency_hash_check
        CHECK (pg_catalog.octet_length(idempotency_key_hash) = 32),
    CONSTRAINT atomic_order_commands_request_fingerprint_check
        CHECK (pg_catalog.octet_length(request_fingerprint) = 32),
    CONSTRAINT atomic_order_commands_fingerprint_version_check
        CHECK (fingerprint_version > 0),
    CONSTRAINT atomic_order_commands_engine_version_check
        CHECK (engine_version > 0),
    CONSTRAINT atomic_order_commands_execution_status_check
        CHECK (
            execution_status = ANY (
                ARRAY[
                    'reserved'::text,
                    'processing'::text,
                    'succeeded'::text,
                    'failed_retryable'::text,
                    'failed_final'::text
                ]
            )
        ),
    CONSTRAINT atomic_order_commands_correlation_reference_check
        CHECK (
            pg_catalog.char_length(correlation_reference)
            BETWEEN 1 AND 128
        ),
    CONSTRAINT atomic_order_commands_created_by_identity_check
        CHECK (
            pg_catalog.char_length(created_by_identity)
            BETWEEN 1 AND 128
        ),
    CONSTRAINT atomic_order_commands_attempt_count_check
        CHECK (attempt_count BETWEEN 0 AND 3),
    CONSTRAINT atomic_order_commands_response_snapshot_check
        CHECK (
            response_snapshot IS NULL
            OR pg_catalog.jsonb_typeof(response_snapshot) = 'object'
        ),
    CONSTRAINT atomic_order_commands_response_version_check
        CHECK (
            response_version IS NULL
            OR pg_catalog.char_length(response_version)
               BETWEEN 1 AND 64
        ),
    CONSTRAINT atomic_order_commands_order_number_check
        CHECK (
            order_number IS NULL
            OR pg_catalog.char_length(order_number)
               BETWEEN 1 AND 64
        ),
    CONSTRAINT atomic_order_commands_error_code_check
        CHECK (
            error_code IS NULL
            OR pg_catalog.char_length(error_code)
               BETWEEN 1 AND 128
        ),
    CONSTRAINT atomic_order_commands_error_detail_check
        CHECK (
            error_detail IS NULL
            OR pg_catalog.char_length(error_detail)
               BETWEEN 1 AND 2000
        ),
    CONSTRAINT atomic_order_commands_last_failure_stage_check
        CHECK (
            last_failure_stage IS NULL
            OR pg_catalog.char_length(last_failure_stage)
               BETWEEN 1 AND 128
        ),
    CONSTRAINT atomic_order_commands_command_retention_check
        CHECK (
            command_retain_until IS NULL
            OR command_retain_until >= created_at
        ),
    CONSTRAINT atomic_order_commands_response_retention_check
        CHECK (
            response_retain_until IS NULL
            OR response_retain_until >= created_at
        ),
    CONSTRAINT atomic_order_commands_retention_order_check
        CHECK (
            command_retain_until IS NULL
            OR response_retain_until IS NULL
            OR response_retain_until <= command_retain_until
        ),
    CONSTRAINT atomic_order_commands_last_started_at_check
        CHECK (
            last_started_at IS NULL
            OR (
                first_started_at IS NOT NULL
                AND last_started_at >= first_started_at
            )
        ),
    CONSTRAINT atomic_order_commands_completed_at_check
        CHECK (
            completed_at IS NULL
            OR (
                first_started_at IS NOT NULL
                AND completed_at >= first_started_at
            )
        ),
    CONSTRAINT atomic_order_commands_failed_at_check
        CHECK (
            failed_at IS NULL
            OR (
                first_started_at IS NOT NULL
                AND failed_at >= first_started_at
            )
        ),
    CONSTRAINT atomic_order_commands_lease_expiry_check
        CHECK (
            lease_expires_at IS NULL
            OR (
                last_started_at IS NOT NULL
                AND lease_expires_at > last_started_at
            )
        ),
    CONSTRAINT atomic_order_commands_reserved_state_check
        CHECK (
            execution_status <> 'reserved'
            OR (
                lease_owner IS NULL
                AND lease_expires_at IS NULL
                AND attempt_count = 0
                AND first_started_at IS NULL
                AND last_started_at IS NULL
                AND completed_at IS NULL
                AND failed_at IS NULL
                AND order_id IS NULL
                AND invoice_id IS NULL
                AND order_number IS NULL
                AND response_version IS NULL
                AND response_snapshot IS NULL
                AND error_code IS NULL
                AND error_detail IS NULL
                AND last_failure_stage IS NULL
            )
        ),
    CONSTRAINT atomic_order_commands_processing_state_check
        CHECK (
            execution_status <> 'processing'
            OR (
                lease_owner IS NOT NULL
                AND lease_expires_at IS NOT NULL
                AND attempt_count BETWEEN 1 AND 3
                AND first_started_at IS NOT NULL
                AND last_started_at IS NOT NULL
                AND completed_at IS NULL
                AND failed_at IS NULL
                AND order_id IS NULL
                AND invoice_id IS NULL
                AND order_number IS NULL
                AND response_version IS NULL
                AND response_snapshot IS NULL
                AND error_code IS NULL
                AND error_detail IS NULL
                AND last_failure_stage IS NULL
            )
        ),
    CONSTRAINT atomic_order_commands_succeeded_state_check
        CHECK (
            execution_status <> 'succeeded'
            OR (
                lease_owner IS NULL
                AND lease_expires_at IS NULL
                AND attempt_count BETWEEN 1 AND 3
                AND first_started_at IS NOT NULL
                AND last_started_at IS NOT NULL
                AND completed_at IS NOT NULL
                AND failed_at IS NULL
                AND order_id IS NOT NULL
                AND invoice_id IS NOT NULL
                AND pg_catalog.char_length(order_number)
                    BETWEEN 1 AND 64
                AND pg_catalog.char_length(response_version)
                    BETWEEN 1 AND 64
                AND response_snapshot IS NOT NULL
                AND error_code IS NULL
                AND error_detail IS NULL
                AND last_failure_stage IS NULL
            )
        ),
    CONSTRAINT atomic_order_commands_failed_retryable_state_check
        CHECK (
            execution_status <> 'failed_retryable'
            OR (
                lease_owner IS NULL
                AND lease_expires_at IS NULL
                AND attempt_count BETWEEN 1 AND 2
                AND first_started_at IS NOT NULL
                AND last_started_at IS NOT NULL
                AND completed_at IS NULL
                AND failed_at IS NOT NULL
                AND order_id IS NULL
                AND invoice_id IS NULL
                AND order_number IS NULL
                AND response_version IS NULL
                AND response_snapshot IS NULL
                AND pg_catalog.char_length(error_code)
                    BETWEEN 1 AND 128
                AND pg_catalog.char_length(last_failure_stage)
                    BETWEEN 1 AND 128
            )
        ),
    CONSTRAINT atomic_order_commands_failed_final_state_check
        CHECK (
            execution_status <> 'failed_final'
            OR (
                lease_owner IS NULL
                AND lease_expires_at IS NULL
                AND attempt_count BETWEEN 1 AND 3
                AND first_started_at IS NOT NULL
                AND last_started_at IS NOT NULL
                AND completed_at IS NULL
                AND failed_at IS NOT NULL
                AND order_id IS NULL
                AND invoice_id IS NULL
                AND order_number IS NULL
                AND response_version IS NULL
                AND response_snapshot IS NULL
                AND pg_catalog.char_length(error_code)
                    BETWEEN 1 AND 128
                AND pg_catalog.char_length(last_failure_stage)
                    BETWEEN 1 AND 128
            )
        ),
    CONSTRAINT atomic_order_commands_updated_at_check
        CHECK (updated_at >= created_at)
);

DO $diagnostic$ BEGIN RAISE NOTICE 'P2D15G_310_COMMAND_TABLE_CREATED'; END $diagnostic$;
DO $diagnostic$ BEGIN RAISE NOTICE 'P2D15G_320_COMMAND_CONSTRAINTS_OK'; END $diagnostic$;

ALTER TABLE public.atomic_order_commands
    OWNER TO afex_core_owner;

DO $command_ownership_verification$
BEGIN
    IF (
        SELECT owner_role.rolname
        FROM pg_catalog.pg_class AS relation_state
        JOIN pg_catalog.pg_roles AS owner_role
          ON owner_role.oid = relation_state.relowner
        WHERE relation_state.oid =
              pg_catalog.to_regclass('public.atomic_order_commands')
    ) IS DISTINCT FROM 'afex_core_owner' THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15C command ownership transfer failed';
    END IF;
END
$command_ownership_verification$;

DO $diagnostic$ BEGIN RAISE NOTICE 'P2D15P_341_COMMAND_OWNERSHIP_OK'; END $diagnostic$;

SET LOCAL ROLE afex_core_owner;

ALTER TABLE public.atomic_order_commands
    ADD CONSTRAINT atomic_order_commands_authorization_context_fk
    FOREIGN KEY (authorization_context_id)
    REFERENCES public.atomic_authorization_contexts (id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED;

DO $diagnostic$ BEGIN RAISE NOTICE 'P2D15G_330_COMMAND_FOREIGN_KEYS_OK'; END $diagnostic$;

ALTER TABLE public.atomic_authorization_contexts
    ADD CONSTRAINT atomic_authorization_contexts_consumed_command_fk
    FOREIGN KEY (consumed_command_id)
    REFERENCES public.atomic_order_commands (id)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED;

CREATE UNIQUE INDEX atomic_authorization_contexts_execution_command_uidx
    ON public.atomic_authorization_contexts (consumed_command_id)
    WHERE consumption_kind = 'execution';

DO $diagnostic$ BEGIN RAISE NOTICE 'P2D15G_360_CONTEXT_CROSSLINK_OK'; END $diagnostic$;

CREATE INDEX atomic_order_commands_processing_lease_idx
    ON public.atomic_order_commands (
        execution_status,
        lease_expires_at,
        id
    )
    WHERE execution_status = 'processing';

CREATE INDEX atomic_order_commands_retryable_recovery_idx
    ON public.atomic_order_commands (
        execution_status,
        failed_at,
        id
    )
    WHERE execution_status = 'failed_retryable';

CREATE INDEX atomic_order_commands_tenant_branch_history_idx
    ON public.atomic_order_commands (
        tenant_id,
        branch_id,
        created_at DESC,
        id
    );

CREATE INDEX atomic_order_commands_actor_history_idx
    ON public.atomic_order_commands (
        authenticated_actor_id,
        created_at DESC,
        id
    );

CREATE INDEX atomic_order_commands_order_lookup_idx
    ON public.atomic_order_commands (order_id)
    WHERE order_id IS NOT NULL;

CREATE INDEX atomic_order_commands_invoice_lookup_idx
    ON public.atomic_order_commands (invoice_id)
    WHERE invoice_id IS NOT NULL;

CREATE INDEX atomic_order_commands_successful_completion_idx
    ON public.atomic_order_commands (completed_at, id)
    WHERE execution_status = 'succeeded';

CREATE INDEX atomic_order_commands_command_retention_idx
    ON public.atomic_order_commands (command_retain_until, id);

CREATE INDEX atomic_order_commands_response_retention_idx
    ON public.atomic_order_commands (response_retain_until, id)
    WHERE response_retain_until IS NOT NULL;

DO $diagnostic$ BEGIN RAISE NOTICE 'P2D15G_340_COMMAND_INDEXES_OK'; END $diagnostic$;

ALTER TABLE public.atomic_order_commands
    ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.atomic_order_commands
    FORCE ROW LEVEL SECURITY;

-- Temporary bootstrap policy. P2D.15D must replace it before function activation.
CREATE POLICY atomic_order_commands_owner_all
    ON public.atomic_order_commands
    AS PERMISSIVE
    FOR ALL
    TO afex_core_owner
    USING (true)
    WITH CHECK (true);

DO $diagnostic$ BEGIN RAISE NOTICE 'P2D15G_350_COMMAND_RLS_POLICY_OK'; END $diagnostic$;

REVOKE ALL PRIVILEGES
    ON TABLE public.atomic_order_commands
    FROM PUBLIC;

REVOKE ALL PRIVILEGES
    ON TABLE public.atomic_order_commands
    FROM anon;

REVOKE ALL PRIVILEGES
    ON TABLE public.atomic_order_commands
    FROM authenticated;

REVOKE ALL PRIVILEGES
    ON TABLE public.atomic_order_commands
    FROM service_role;

REVOKE ALL PRIVILEGES
    ON TABLE public.atomic_order_commands
    FROM afex_core_runtime;

REVOKE ALL PRIVILEGES
    ON TABLE public.atomic_order_commands
    FROM afex_context_issuer;

REVOKE ALL PRIVILEGES
    ON TABLE public.atomic_order_commands
    FROM afex_outbox_worker;

REVOKE ALL PRIVILEGES
    ON TABLE public.atomic_order_commands
    FROM afex_function_owner;

DO $verification$
DECLARE
    command_relation oid;
    context_relation oid;
    verification_failure_count integer;
BEGIN
    SELECT relation_state.oid
    INTO command_relation
    FROM pg_catalog.pg_class AS relation_state
    JOIN pg_catalog.pg_namespace AS namespace_state
      ON namespace_state.oid = relation_state.relnamespace
    WHERE namespace_state.nspname = 'public'
      AND relation_state.relname = 'atomic_order_commands'
      AND relation_state.relkind = 'r';

    SELECT relation_state.oid
    INTO context_relation
    FROM pg_catalog.pg_class AS relation_state
    JOIN pg_catalog.pg_namespace AS namespace_state
      ON namespace_state.oid = relation_state.relnamespace
    WHERE namespace_state.nspname = 'public'
      AND relation_state.relname = 'atomic_authorization_contexts'
      AND relation_state.relkind = 'r';

    IF command_relation IS NULL OR context_relation IS NULL THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15C verification failed: required tables are missing';
    END IF;

    IF (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_class AS relation_state
        JOIN pg_catalog.pg_namespace AS namespace_state
          ON namespace_state.oid = relation_state.relnamespace
        WHERE namespace_state.nspname = 'public'
          AND relation_state.relname = 'atomic_order_commands'
    ) <> 1 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15C verification failed: target relation count is invalid';
    END IF;

    IF (
        SELECT owner_role.rolname
        FROM pg_catalog.pg_class AS relation_state
        JOIN pg_catalog.pg_roles AS owner_role
          ON owner_role.oid = relation_state.relowner
        WHERE relation_state.oid = command_relation
    ) IS DISTINCT FROM 'afex_core_owner' THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15C verification failed: table owner is invalid';
    END IF;

    SELECT pg_catalog.count(*)
    INTO verification_failure_count
    FROM (
        VALUES
            ('id', 'uuid', true, NULL::text),
            ('command_version', 'smallint', true, NULL::text),
            ('command_type', 'text', true, NULL::text),
            ('tenant_id', 'uuid', true, NULL::text),
            ('branch_id', 'uuid', true, NULL::text),
            ('idempotency_key_hash', 'bytea', true, NULL::text),
            ('request_fingerprint', 'bytea', true, NULL::text),
            ('fingerprint_version', 'smallint', true, NULL::text),
            ('authorization_context_id', 'uuid', true, NULL::text),
            ('authenticated_actor_id', 'uuid', true, NULL::text),
            ('correlation_reference', 'text', true, NULL::text),
            ('engine_version', 'smallint', true, NULL::text),
            ('execution_status', 'text', true, NULL::text),
            ('lease_owner', 'uuid', false, NULL::text),
            (
                'lease_expires_at',
                'timestamp with time zone',
                false,
                NULL::text
            ),
            ('attempt_count', 'integer', true, '0'),
            ('order_id', 'uuid', false, NULL::text),
            ('invoice_id', 'uuid', false, NULL::text),
            ('order_number', 'text', false, NULL::text),
            ('response_version', 'text', false, NULL::text),
            ('response_snapshot', 'jsonb', false, NULL::text),
            ('error_code', 'text', false, NULL::text),
            ('error_detail', 'text', false, NULL::text),
            ('last_failure_stage', 'text', false, NULL::text),
            (
                'first_started_at',
                'timestamp with time zone',
                false,
                NULL::text
            ),
            (
                'last_started_at',
                'timestamp with time zone',
                false,
                NULL::text
            ),
            (
                'completed_at',
                'timestamp with time zone',
                false,
                NULL::text
            ),
            ('failed_at', 'timestamp with time zone', false, NULL::text),
            (
                'created_at',
                'timestamp with time zone',
                true,
                'transaction_timestamp()'
            ),
            (
                'updated_at',
                'timestamp with time zone',
                true,
                'transaction_timestamp()'
            ),
            ('created_by_identity', 'text', true, NULL::text),
            (
                'command_retain_until',
                'timestamp with time zone',
                false,
                NULL::text
            ),
            (
                'response_retain_until',
                'timestamp with time zone',
                false,
                NULL::text
            )
    ) AS expected_column(
        column_name,
        formatted_type,
        required_not_null,
        default_expression
    )
    WHERE NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute AS attribute_state
        LEFT JOIN pg_catalog.pg_attrdef AS default_state
          ON default_state.adrelid = attribute_state.attrelid
         AND default_state.adnum = attribute_state.attnum
        WHERE attribute_state.attrelid = command_relation
          AND attribute_state.attname = expected_column.column_name
          AND attribute_state.attnum > 0
          AND NOT attribute_state.attisdropped
          AND pg_catalog.format_type(
              attribute_state.atttypid,
              attribute_state.atttypmod
          ) = expected_column.formatted_type
          AND attribute_state.attnotnull =
              expected_column.required_not_null
          AND pg_catalog.pg_get_expr(
              default_state.adbin,
              default_state.adrelid
          ) IS NOT DISTINCT FROM expected_column.default_expression
    );

    IF verification_failure_count <> 0 OR (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_attribute AS attribute_state
        WHERE attribute_state.attrelid = command_relation
          AND attribute_state.attnum > 0
          AND NOT attribute_state.attisdropped
    ) <> 33 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15C verification failed: column contract mismatch',
            detail = pg_catalog.format(
                'Missing or invalid columns: %s',
                verification_failure_count
            );
    END IF;

    SELECT pg_catalog.count(*)
    INTO verification_failure_count
    FROM (
        VALUES
            ('atomic_order_commands_pkey', 'p'::"char"),
            (
                'atomic_order_commands_scoped_idempotency_key',
                'u'::"char"
            ),
            (
                'atomic_order_commands_authorization_context_key',
                'u'::"char"
            ),
            ('atomic_order_commands_tenant_fk', 'f'::"char"),
            ('atomic_order_commands_branch_fk', 'f'::"char"),
            ('atomic_order_commands_actor_fk', 'f'::"char"),
            (
                'atomic_order_commands_authorization_context_fk',
                'f'::"char"
            ),
            ('atomic_order_commands_order_fk', 'f'::"char"),
            ('atomic_order_commands_invoice_fk', 'f'::"char"),
            (
                'atomic_order_commands_command_version_check',
                'c'::"char"
            ),
            (
                'atomic_order_commands_command_type_check',
                'c'::"char"
            ),
            (
                'atomic_order_commands_idempotency_hash_check',
                'c'::"char"
            ),
            (
                'atomic_order_commands_request_fingerprint_check',
                'c'::"char"
            ),
            (
                'atomic_order_commands_fingerprint_version_check',
                'c'::"char"
            ),
            (
                'atomic_order_commands_engine_version_check',
                'c'::"char"
            ),
            (
                'atomic_order_commands_execution_status_check',
                'c'::"char"
            ),
            (
                'atomic_order_commands_correlation_reference_check',
                'c'::"char"
            ),
            (
                'atomic_order_commands_created_by_identity_check',
                'c'::"char"
            ),
            (
                'atomic_order_commands_attempt_count_check',
                'c'::"char"
            ),
            (
                'atomic_order_commands_response_snapshot_check',
                'c'::"char"
            ),
            (
                'atomic_order_commands_response_version_check',
                'c'::"char"
            ),
            (
                'atomic_order_commands_order_number_check',
                'c'::"char"
            ),
            (
                'atomic_order_commands_error_code_check',
                'c'::"char"
            ),
            (
                'atomic_order_commands_error_detail_check',
                'c'::"char"
            ),
            (
                'atomic_order_commands_last_failure_stage_check',
                'c'::"char"
            ),
            (
                'atomic_order_commands_command_retention_check',
                'c'::"char"
            ),
            (
                'atomic_order_commands_response_retention_check',
                'c'::"char"
            ),
            (
                'atomic_order_commands_retention_order_check',
                'c'::"char"
            ),
            (
                'atomic_order_commands_last_started_at_check',
                'c'::"char"
            ),
            (
                'atomic_order_commands_completed_at_check',
                'c'::"char"
            ),
            (
                'atomic_order_commands_failed_at_check',
                'c'::"char"
            ),
            (
                'atomic_order_commands_lease_expiry_check',
                'c'::"char"
            ),
            (
                'atomic_order_commands_reserved_state_check',
                'c'::"char"
            ),
            (
                'atomic_order_commands_processing_state_check',
                'c'::"char"
            ),
            (
                'atomic_order_commands_succeeded_state_check',
                'c'::"char"
            ),
            (
                'atomic_order_commands_failed_retryable_state_check',
                'c'::"char"
            ),
            (
                'atomic_order_commands_failed_final_state_check',
                'c'::"char"
            ),
            (
                'atomic_order_commands_updated_at_check',
                'c'::"char"
            )
    ) AS expected_constraint(constraint_name, constraint_type)
    WHERE NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint AS constraint_state
        WHERE constraint_state.conrelid = command_relation
          AND constraint_state.conname =
              expected_constraint.constraint_name
          AND constraint_state.contype =
              expected_constraint.constraint_type
          AND constraint_state.convalidated
    );

    IF verification_failure_count <> 0 OR (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_constraint AS constraint_state
        WHERE constraint_state.conrelid = command_relation
    ) <> 38 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15C verification failed: constraint contract mismatch',
            detail = pg_catalog.format(
                'Missing or invalid constraints: %s',
                verification_failure_count
            );
    END IF;

    IF (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_constraint AS constraint_state
        WHERE constraint_state.conrelid = command_relation
          AND constraint_state.contype = 'f'
    ) <> 6 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15C verification failed: foreign-key count mismatch';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint AS constraint_state
        WHERE constraint_state.conrelid = command_relation
          AND constraint_state.conname =
              'atomic_order_commands_authorization_context_fk'
          AND constraint_state.condeferrable
          AND constraint_state.condeferred
          AND constraint_state.confupdtype = 'r'
          AND constraint_state.confdeltype = 'r'
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15C verification failed: authorization-context FK semantics are invalid';
    END IF;

    IF (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_constraint AS constraint_state
        WHERE constraint_state.conrelid = context_relation
          AND constraint_state.conname =
              'atomic_authorization_contexts_consumed_command_fk'
          AND constraint_state.contype = 'f'
          AND constraint_state.confrelid = command_relation
          AND constraint_state.condeferrable
          AND constraint_state.condeferred
          AND constraint_state.confupdtype = 'r'
          AND constraint_state.confdeltype = 'r'
    ) <> 1 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15C verification failed: consumed-command cross-link is invalid';
    END IF;

    SELECT pg_catalog.count(*)
    INTO verification_failure_count
    FROM (
        VALUES
            ('atomic_order_commands_pkey', true, true),
            (
                'atomic_order_commands_scoped_idempotency_key',
                true,
                false
            ),
            (
                'atomic_order_commands_authorization_context_key',
                true,
                false
            ),
            (
                'atomic_order_commands_processing_lease_idx',
                false,
                false
            ),
            (
                'atomic_order_commands_retryable_recovery_idx',
                false,
                false
            ),
            (
                'atomic_order_commands_tenant_branch_history_idx',
                false,
                false
            ),
            (
                'atomic_order_commands_actor_history_idx',
                false,
                false
            ),
            (
                'atomic_order_commands_order_lookup_idx',
                false,
                false
            ),
            (
                'atomic_order_commands_invoice_lookup_idx',
                false,
                false
            ),
            (
                'atomic_order_commands_successful_completion_idx',
                false,
                false
            ),
            (
                'atomic_order_commands_command_retention_idx',
                false,
                false
            ),
            (
                'atomic_order_commands_response_retention_idx',
                false,
                false
            )
    ) AS expected_index(index_name, is_unique, is_primary)
    WHERE NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_index AS index_state
        JOIN pg_catalog.pg_class AS index_relation
          ON index_relation.oid = index_state.indexrelid
        WHERE index_state.indrelid = command_relation
          AND index_relation.relname = expected_index.index_name
          AND index_state.indisunique = expected_index.is_unique
          AND index_state.indisprimary = expected_index.is_primary
          AND index_state.indisvalid
          AND index_state.indisready
          AND index_state.indislive
    );

    IF verification_failure_count <> 0 OR (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_index AS index_state
        WHERE index_state.indrelid = command_relation
    ) <> 12 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15C verification failed: index contract mismatch',
            detail = pg_catalog.format(
                'Missing or invalid indexes: %s',
                verification_failure_count
            );
    END IF;

    SELECT pg_catalog.count(*)
    INTO verification_failure_count
    FROM (
        VALUES
            (
                'atomic_order_commands_processing_lease_idx',
                ARRAY[
                    'execution_status',
                    'lease_expires_at',
                    'id'
                ]::text[],
                '(execution_status = ''processing''::text)'
            ),
            (
                'atomic_order_commands_retryable_recovery_idx',
                ARRAY[
                    'execution_status',
                    'failed_at',
                    'id'
                ]::text[],
                '(execution_status = ''failed_retryable''::text)'
            ),
            (
                'atomic_order_commands_tenant_branch_history_idx',
                ARRAY[
                    'tenant_id',
                    'branch_id',
                    'created_at',
                    'id'
                ]::text[],
                NULL::text
            ),
            (
                'atomic_order_commands_actor_history_idx',
                ARRAY[
                    'authenticated_actor_id',
                    'created_at',
                    'id'
                ]::text[],
                NULL::text
            ),
            (
                'atomic_order_commands_order_lookup_idx',
                ARRAY['order_id']::text[],
                '(order_id IS NOT NULL)'
            ),
            (
                'atomic_order_commands_invoice_lookup_idx',
                ARRAY['invoice_id']::text[],
                '(invoice_id IS NOT NULL)'
            ),
            (
                'atomic_order_commands_successful_completion_idx',
                ARRAY['completed_at', 'id']::text[],
                '(execution_status = ''succeeded''::text)'
            ),
            (
                'atomic_order_commands_command_retention_idx',
                ARRAY['command_retain_until', 'id']::text[],
                NULL::text
            ),
            (
                'atomic_order_commands_response_retention_idx',
                ARRAY['response_retain_until', 'id']::text[],
                '(response_retain_until IS NOT NULL)'
            )
    ) AS expected_index(
        index_name,
        key_columns,
        predicate_expression
    )
    WHERE NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_index AS index_state
        JOIN pg_catalog.pg_class AS index_relation
          ON index_relation.oid = index_state.indexrelid
        WHERE index_state.indrelid = command_relation
          AND index_relation.relname = expected_index.index_name
          AND (
              SELECT pg_catalog.array_agg(
                  attribute_state.attname::text
                  ORDER BY key_position.ordinality
              )
              FROM unnest(index_state.indkey::smallint[])
                   WITH ORDINALITY AS key_position(
                       attribute_number,
                       ordinality
                   )
              JOIN pg_catalog.pg_attribute AS attribute_state
                ON attribute_state.attrelid = index_state.indrelid
               AND attribute_state.attnum =
                   key_position.attribute_number
              WHERE key_position.ordinality <=
                    index_state.indnkeyatts
          ) = expected_index.key_columns
          AND pg_catalog.pg_get_expr(
              index_state.indpred,
              index_state.indrelid
          ) IS NOT DISTINCT FROM expected_index.predicate_expression
    );

    IF verification_failure_count <> 0 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15C verification failed: index keys or predicates mismatch',
            detail = pg_catalog.format(
                'Missing or invalid index definitions: %s',
                verification_failure_count
            );
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_index AS index_state
        JOIN pg_catalog.pg_attribute AS attribute_state
          ON attribute_state.attrelid = index_state.indrelid
         AND attribute_state.attnum = index_state.indkey[0]
        WHERE index_state.indrelid = command_relation
          AND index_state.indisunique
          AND index_state.indnkeyatts = 1
          AND attribute_state.attname = 'idempotency_key_hash'
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15C verification failed: global idempotency uniqueness exists';
    END IF;

    IF (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_index AS index_state
        JOIN pg_catalog.pg_class AS index_relation
          ON index_relation.oid = index_state.indexrelid
        WHERE index_state.indrelid = context_relation
          AND index_relation.relname =
              'atomic_authorization_contexts_execution_command_uidx'
          AND index_state.indisunique
          AND index_state.indisvalid
          AND index_state.indisready
          AND pg_catalog.pg_get_expr(
              index_state.indpred,
              index_state.indrelid
          ) = '(consumption_kind = ''execution''::text)'
    ) <> 1 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15C verification failed: execution-context uniqueness is invalid';
    END IF;

    IF NOT (
        SELECT relation_state.relrowsecurity
               AND relation_state.relforcerowsecurity
        FROM pg_catalog.pg_class AS relation_state
        WHERE relation_state.oid = command_relation
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15C verification failed: RLS contract mismatch';
    END IF;

    IF (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_policy AS policy_state
        WHERE policy_state.polrelid = command_relation
          AND policy_state.polname = 'atomic_order_commands_owner_all'
          AND policy_state.polcmd = '*'
          AND policy_state.polpermissive
          AND policy_state.polroles = ARRAY[
              (
                  SELECT role_state.oid
                  FROM pg_catalog.pg_roles AS role_state
                  WHERE role_state.rolname = 'afex_core_owner'
              )
          ]::oid[]
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
        WHERE policy_state.polrelid = command_relation
    ) <> 1 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15C verification failed: bootstrap policy contract mismatch';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class AS relation_state
        CROSS JOIN LATERAL pg_catalog.aclexplode(
            CASE
                WHEN pg_catalog.array_ndims(
                    relation_state.relacl
                ) = 1 THEN relation_state.relacl
                ELSE NULL::pg_catalog.aclitem[]
            END
        ) AS acl_state
        WHERE relation_state.oid = command_relation
          AND (
              acl_state.grantee = 0
              OR acl_state.grantee IN (
                  SELECT role_state.oid
                  FROM pg_catalog.pg_roles AS role_state
                  WHERE role_state.rolname IN (
                      'anon',
                      'authenticated',
                      'service_role',
                      'afex_core_runtime',
                      'afex_context_issuer',
                      'afex_outbox_worker',
                      'afex_function_owner'
                  )
              )
          )
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15C verification failed: unexpected direct table privilege';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.atomic_order_commands
    ) OR EXISTS (
        SELECT 1
        FROM public.atomic_authorization_contexts
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15C verification failed: foundation tables are not empty';
    END IF;

    RAISE NOTICE 'P2D15G_370_P2D15C_VERIFICATION_OK';
END
$verification$;

SELECT
    owner_role.rolname AS table_owner,
    command_relation.relrowsecurity AS rls_enabled,
    command_relation.relforcerowsecurity AS force_rls_enabled,
    (
        SELECT pg_catalog.count(*)
        FROM public.atomic_order_commands
    ) AS row_count,
    (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_policy AS policy_state
        WHERE policy_state.polrelid = command_relation.oid
    ) AS policy_count,
    EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint AS constraint_state
        WHERE constraint_state.conrelid = command_relation.oid
          AND constraint_state.conname =
              'atomic_order_commands_scoped_idempotency_key'
          AND constraint_state.contype = 'u'
    ) AS scoped_idempotency_unique_present,
    EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint AS constraint_state
        WHERE constraint_state.conrelid = command_relation.oid
          AND constraint_state.conname =
              'atomic_order_commands_authorization_context_key'
          AND constraint_state.contype = 'u'
    ) AS authorization_context_unique_present,
    consumed_command_fk.condeferrable
        AS consumed_command_fk_deferrable,
    consumed_command_fk.condeferred
        AS consumed_command_fk_initially_deferred,
    EXISTS (
        SELECT 1
        FROM pg_catalog.pg_index AS index_state
        JOIN pg_catalog.pg_class AS index_relation
          ON index_relation.oid = index_state.indexrelid
        WHERE index_state.indrelid = context_relation.oid
          AND index_relation.relname =
              'atomic_authorization_contexts_execution_command_uidx'
          AND index_state.indisunique
    ) AS execution_context_partial_unique_present,
    EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint AS constraint_state
        WHERE constraint_state.conrelid = command_relation.oid
          AND constraint_state.conname =
              'atomic_order_commands_order_fk'
          AND constraint_state.contype = 'f'
    ) AS business_order_fk_present,
    EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint AS constraint_state
        WHERE constraint_state.conrelid = command_relation.oid
          AND constraint_state.conname =
              'atomic_order_commands_invoice_fk'
          AND constraint_state.contype = 'f'
    ) AS business_invoice_fk_present
FROM pg_catalog.pg_class AS command_relation
JOIN pg_catalog.pg_namespace AS command_namespace
  ON command_namespace.oid = command_relation.relnamespace
JOIN pg_catalog.pg_roles AS owner_role
  ON owner_role.oid = command_relation.relowner
JOIN pg_catalog.pg_class AS context_relation
  ON context_relation.oid =
     pg_catalog.to_regclass('public.atomic_authorization_contexts')
JOIN pg_catalog.pg_constraint AS consumed_command_fk
  ON consumed_command_fk.conrelid = context_relation.oid
 AND consumed_command_fk.conname =
     'atomic_authorization_contexts_consumed_command_fk'
WHERE command_namespace.nspname = 'public'
  AND command_relation.relname = 'atomic_order_commands'
  AND command_relation.relkind = 'r';

-- END OF P2D.15C FRESH ATOMIC COMMAND FOUNDATION

-- P2D.15D — Final Privilege Closure & RLS Replacement
-- STATUS: DRAFT

DO $diagnostic$ BEGIN RAISE NOTICE 'P2D15G_400_P2D15D_BEGIN'; END $diagnostic$;

DO $preflight$
DECLARE
    target_relation record;
    function_owner_oid oid;
    core_owner_oid oid;
BEGIN
    SELECT role_state.oid
    INTO function_owner_oid
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname = 'afex_function_owner';

    SELECT role_state.oid
    INTO core_owner_oid
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname = 'afex_core_owner';

    IF function_owner_oid IS NULL OR core_owner_oid IS NULL THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15D preflight failed: required security roles are missing';
    END IF;

    FOR target_relation IN
        SELECT
            required_table.table_name,
            required_table.bootstrap_policy,
            relation_state.oid AS relation_oid,
            relation_state.relowner,
            relation_state.relrowsecurity,
            relation_state.relforcerowsecurity
        FROM (
            VALUES
                (
                    'atomic_authorization_contexts',
                    'atomic_authorization_contexts_owner_all'
                ),
                (
                    'atomic_order_commands',
                    'atomic_order_commands_owner_all'
                )
        ) AS required_table(table_name, bootstrap_policy)
        LEFT JOIN pg_catalog.pg_class AS relation_state
          ON relation_state.relname = required_table.table_name
         AND relation_state.relnamespace = (
             SELECT namespace_state.oid
             FROM pg_catalog.pg_namespace AS namespace_state
             WHERE namespace_state.nspname = 'public'
         )
         AND relation_state.relkind = 'r'
    LOOP
        IF target_relation.relation_oid IS NULL THEN
            RAISE EXCEPTION USING
                errcode = '55000',
                message = 'P2D.15D preflight failed: required table is missing',
                detail = 'public.' || target_relation.table_name;
        END IF;

        IF target_relation.relowner <> core_owner_oid THEN
            RAISE EXCEPTION USING
                errcode = '55000',
                message = 'P2D.15D preflight failed: table owner is invalid',
                detail = 'public.' || target_relation.table_name;
        END IF;

        IF NOT target_relation.relrowsecurity
           OR NOT target_relation.relforcerowsecurity THEN
            RAISE EXCEPTION USING
                errcode = '55000',
                message = 'P2D.15D preflight failed: table RLS state is invalid',
                detail = 'public.' || target_relation.table_name;
        END IF;

        IF (
            SELECT pg_catalog.count(*)
            FROM pg_catalog.pg_policy AS policy_state
            WHERE policy_state.polrelid = target_relation.relation_oid
        ) <> 1 OR (
            SELECT pg_catalog.count(*)
            FROM pg_catalog.pg_policy AS policy_state
            WHERE policy_state.polrelid = target_relation.relation_oid
              AND policy_state.polname =
                  target_relation.bootstrap_policy
              AND policy_state.polcmd = '*'
              AND policy_state.polpermissive
              AND policy_state.polroles =
                  ARRAY[core_owner_oid]::oid[]
              AND pg_catalog.pg_get_expr(
                  policy_state.polqual,
                  policy_state.polrelid
              ) = 'true'
              AND pg_catalog.pg_get_expr(
                  policy_state.polwithcheck,
                  policy_state.polrelid
              ) = 'true'
        ) <> 1 THEN
            RAISE EXCEPTION USING
                errcode = '55000',
                message = 'P2D.15D preflight failed: bootstrap policy contract mismatch',
                detail = 'public.' || target_relation.table_name;
        END IF;

        IF EXISTS (
            SELECT 1
            FROM pg_catalog.pg_trigger AS trigger_state
            WHERE trigger_state.tgrelid =
                  target_relation.relation_oid
              AND NOT trigger_state.tgisinternal
        ) THEN
            RAISE EXCEPTION USING
                errcode = '55000',
                message = 'P2D.15D preflight failed: unexpected table trigger exists',
                detail = 'public.' || target_relation.table_name;
        END IF;
    END LOOP;
END
$preflight$;

DROP POLICY atomic_authorization_contexts_owner_all
    ON public.atomic_authorization_contexts;

DROP POLICY atomic_order_commands_owner_all
    ON public.atomic_order_commands;

DO $diagnostic$ BEGIN RAISE NOTICE 'P2D15G_410_BOOTSTRAP_POLICIES_REMOVED'; END $diagnostic$;

CREATE POLICY atomic_authorization_contexts_function_owner_all
    ON public.atomic_authorization_contexts
    AS PERMISSIVE
    FOR ALL
    TO afex_function_owner
    USING (true)
    WITH CHECK (true);

CREATE POLICY atomic_order_commands_function_owner_all
    ON public.atomic_order_commands
    AS PERMISSIVE
    FOR ALL
    TO afex_function_owner
    USING (true)
    WITH CHECK (true);

DO $diagnostic$ BEGIN RAISE NOTICE 'P2D15G_420_FINAL_POLICIES_CREATED'; END $diagnostic$;

REVOKE ALL PRIVILEGES
    ON TABLE public.atomic_authorization_contexts
    FROM PUBLIC;

REVOKE ALL PRIVILEGES
    ON TABLE public.atomic_authorization_contexts
    FROM anon;

REVOKE ALL PRIVILEGES
    ON TABLE public.atomic_authorization_contexts
    FROM authenticated;

REVOKE ALL PRIVILEGES
    ON TABLE public.atomic_authorization_contexts
    FROM service_role;

REVOKE ALL PRIVILEGES
    ON TABLE public.atomic_authorization_contexts
    FROM afex_core_runtime;

REVOKE ALL PRIVILEGES
    ON TABLE public.atomic_authorization_contexts
    FROM afex_context_issuer;

REVOKE ALL PRIVILEGES
    ON TABLE public.atomic_authorization_contexts
    FROM afex_outbox_worker;

REVOKE ALL PRIVILEGES
    ON TABLE public.atomic_authorization_contexts
    FROM afex_function_owner;

REVOKE ALL PRIVILEGES
    ON TABLE public.atomic_order_commands
    FROM PUBLIC;

REVOKE ALL PRIVILEGES
    ON TABLE public.atomic_order_commands
    FROM anon;

REVOKE ALL PRIVILEGES
    ON TABLE public.atomic_order_commands
    FROM authenticated;

REVOKE ALL PRIVILEGES
    ON TABLE public.atomic_order_commands
    FROM service_role;

REVOKE ALL PRIVILEGES
    ON TABLE public.atomic_order_commands
    FROM afex_core_runtime;

REVOKE ALL PRIVILEGES
    ON TABLE public.atomic_order_commands
    FROM afex_context_issuer;

REVOKE ALL PRIVILEGES
    ON TABLE public.atomic_order_commands
    FROM afex_outbox_worker;

REVOKE ALL PRIVILEGES
    ON TABLE public.atomic_order_commands
    FROM afex_function_owner;

GRANT SELECT, INSERT, UPDATE
    ON TABLE public.atomic_authorization_contexts
    TO afex_function_owner;

GRANT SELECT, INSERT, UPDATE
    ON TABLE public.atomic_order_commands
    TO afex_function_owner;

DO $diagnostic$ BEGIN RAISE NOTICE 'P2D15G_430_FINAL_PRIVILEGES_APPLIED'; END $diagnostic$;

RESET ROLE;

DO $bootstrap_cleanup_preflight$
DECLARE
    installation_role_oid oid;
    core_owner_oid oid;
    target_role_oids oid[];
    target_relation_oids oid[];
    automatic_grantor_oid oid;
    public_schema_oid oid;
BEGIN
    SELECT role_state.oid
    INTO installation_role_oid
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname = CURRENT_USER;

    SELECT role_state.oid
    INTO core_owner_oid
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname = 'afex_core_owner';

    SELECT pg_catalog.array_agg(role_state.oid ORDER BY role_state.rolname)
    INTO target_role_oids
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname = ANY (ARRAY[
        'afex_core_owner',
        'afex_core_runtime',
        'afex_context_issuer',
        'afex_outbox_worker',
        'afex_function_owner'
    ]);

    SELECT
        (pg_catalog.array_agg(
            DISTINCT membership.grantor
            ORDER BY membership.grantor
        ))[1]
    INTO automatic_grantor_oid
    FROM pg_catalog.pg_auth_members AS membership
    WHERE membership.roleid = ANY (target_role_oids)
      AND membership.member = installation_role_oid
      AND membership.grantor <> installation_role_oid
      AND membership.admin_option
      AND NOT membership.inherit_option
      AND NOT membership.set_option;

    SELECT pg_catalog.array_agg(relation_state.oid ORDER BY relation_state.oid)
    INTO target_relation_oids
    FROM pg_catalog.pg_class AS relation_state
    JOIN pg_catalog.pg_namespace AS namespace_state
      ON namespace_state.oid = relation_state.relnamespace
    WHERE namespace_state.nspname = 'public'
      AND relation_state.relname IN (
          'atomic_authorization_contexts',
          'atomic_order_commands'
      )
      AND relation_state.relkind = 'r';

    SELECT namespace_state.oid
    INTO public_schema_oid
    FROM pg_catalog.pg_namespace AS namespace_state
    WHERE namespace_state.nspname = 'public';

    IF installation_role_oid IS NULL
       OR core_owner_oid IS NULL
       OR automatic_grantor_oid IS NULL
       OR automatic_grantor_oid = installation_role_oid
       OR public_schema_oid IS NULL
       OR pg_catalog.cardinality(target_role_oids) <> 5
       OR pg_catalog.cardinality(target_relation_oids) <> 2
       OR EXISTS (
            SELECT 1
            FROM pg_catalog.pg_class AS relation_state
            WHERE relation_state.oid = ANY (target_relation_oids)
              AND relation_state.relowner <> core_owner_oid
       )
       OR EXISTS (
            SELECT 1
            FROM pg_catalog.pg_index AS index_state
            JOIN pg_catalog.pg_class AS index_relation
              ON index_relation.oid = index_state.indexrelid
            WHERE index_state.indrelid = ANY (target_relation_oids)
              AND index_relation.relowner <> core_owner_oid
       )
       OR EXISTS (
            SELECT 1
            FROM pg_catalog.pg_type AS type_state
            WHERE type_state.typrelid = ANY (target_relation_oids)
              AND type_state.typowner <> core_owner_oid
       )
       OR (
            SELECT pg_catalog.count(*)
            FROM pg_catalog.pg_auth_members AS membership
            WHERE membership.roleid = ANY (target_role_oids)
               OR membership.member = ANY (target_role_oids)
       ) <> 6
       OR EXISTS (
            SELECT 1
            FROM unnest(target_role_oids) AS target_role(role_oid)
            WHERE (
                SELECT pg_catalog.count(*)
                FROM pg_catalog.pg_auth_members AS membership
                WHERE membership.roleid = target_role.role_oid
                  AND membership.member = installation_role_oid
            ) <> CASE
                WHEN target_role.role_oid = core_owner_oid THEN 2
                ELSE 1
            END
       )
       OR (
            SELECT pg_catalog.count(*)
            FROM pg_catalog.pg_auth_members AS membership
            WHERE membership.roleid = core_owner_oid
              AND membership.member = installation_role_oid
              AND membership.grantor = automatic_grantor_oid
              AND membership.admin_option
              AND NOT membership.inherit_option
              AND NOT membership.set_option
       ) <> 1
       OR (
            SELECT pg_catalog.count(*)
            FROM pg_catalog.pg_auth_members AS membership
            WHERE membership.roleid = ANY (target_role_oids)
              AND membership.member = installation_role_oid
              AND membership.grantor = automatic_grantor_oid
              AND membership.member <> ALL (target_role_oids)
              AND membership.admin_option
              AND NOT membership.inherit_option
              AND NOT membership.set_option
       ) <> 5
       OR (
            SELECT pg_catalog.count(*)
            FROM pg_catalog.pg_auth_members AS membership
            WHERE membership.roleid = core_owner_oid
              AND membership.member = installation_role_oid
              AND membership.grantor = installation_role_oid
              AND NOT membership.admin_option
              AND NOT membership.inherit_option
              AND membership.set_option
       ) <> 1
       OR EXISTS (
            SELECT 1
            FROM pg_catalog.pg_auth_members AS membership
            WHERE membership.member = ANY (target_role_oids)
       )
       OR NOT pg_catalog.has_schema_privilege(
            core_owner_oid,
            public_schema_oid,
            'CREATE'
       ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15D bootstrap cleanup preflight failed';
    END IF;
END
$bootstrap_cleanup_preflight$;

DO $diagnostic$ BEGIN RAISE NOTICE 'P2D15P_431_GRANTOR_SCOPED_CLEANUP_BEGIN'; END $diagnostic$;

REVOKE CREATE ON SCHEMA public FROM afex_core_owner;

REVOKE afex_core_owner
FROM CURRENT_USER
GRANTED BY CURRENT_USER;

DO $diagnostic$ BEGIN RAISE NOTICE 'P2D15P_432_TEMPORARY_GRANT_REMOVED'; END $diagnostic$;

DO $bootstrap_cleanup_verification$
DECLARE
    installation_role_oid oid;
    core_owner_oid oid;
    target_role_oids oid[];
    target_relation_oids oid[];
    automatic_grantor_oid oid;
    public_schema_oid oid;
BEGIN
    SELECT role_state.oid
    INTO installation_role_oid
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname = CURRENT_USER;

    SELECT role_state.oid
    INTO core_owner_oid
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname = 'afex_core_owner';

    SELECT pg_catalog.array_agg(role_state.oid ORDER BY role_state.rolname)
    INTO target_role_oids
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname = ANY (ARRAY[
        'afex_core_owner',
        'afex_core_runtime',
        'afex_context_issuer',
        'afex_outbox_worker',
        'afex_function_owner'
    ]);

    SELECT
        (pg_catalog.array_agg(
            DISTINCT membership.grantor
            ORDER BY membership.grantor
        ))[1]
    INTO automatic_grantor_oid
    FROM pg_catalog.pg_auth_members AS membership
    WHERE membership.roleid = ANY (target_role_oids)
      AND membership.member = installation_role_oid
      AND membership.grantor <> installation_role_oid
      AND membership.admin_option
      AND NOT membership.inherit_option
      AND NOT membership.set_option;

    SELECT pg_catalog.array_agg(relation_state.oid ORDER BY relation_state.oid)
    INTO target_relation_oids
    FROM pg_catalog.pg_class AS relation_state
    JOIN pg_catalog.pg_namespace AS namespace_state
      ON namespace_state.oid = relation_state.relnamespace
    WHERE namespace_state.nspname = 'public'
      AND relation_state.relname IN (
          'atomic_authorization_contexts',
          'atomic_order_commands'
      )
      AND relation_state.relkind = 'r';

    SELECT namespace_state.oid
    INTO public_schema_oid
    FROM pg_catalog.pg_namespace AS namespace_state
    WHERE namespace_state.nspname = 'public';

    IF installation_role_oid IS NULL
       OR core_owner_oid IS NULL
       OR automatic_grantor_oid IS NULL
       OR automatic_grantor_oid = installation_role_oid
       OR public_schema_oid IS NULL
       OR pg_catalog.cardinality(target_role_oids) <> 5
       OR pg_catalog.cardinality(target_relation_oids) <> 2
       OR (
            SELECT pg_catalog.count(*)
            FROM pg_catalog.pg_auth_members AS membership
            WHERE membership.roleid = ANY (target_role_oids)
               OR membership.member = ANY (target_role_oids)
       ) <> 5
       OR EXISTS (
            SELECT 1
            FROM unnest(target_role_oids) AS target_role(role_oid)
            WHERE (
                SELECT pg_catalog.count(*)
                FROM pg_catalog.pg_auth_members AS membership
                WHERE membership.roleid = target_role.role_oid
                  AND membership.member = installation_role_oid
            ) <> 1
       )
       OR (
            SELECT pg_catalog.count(*)
            FROM pg_catalog.pg_auth_members AS membership
            WHERE membership.roleid = ANY (target_role_oids)
              AND membership.member = installation_role_oid
              AND membership.grantor = automatic_grantor_oid
              AND membership.member <> ALL (target_role_oids)
              AND membership.admin_option
              AND NOT membership.inherit_option
              AND NOT membership.set_option
       ) <> 5
       OR EXISTS (
            SELECT 1
            FROM pg_catalog.pg_auth_members AS membership
            WHERE membership.roleid = ANY (target_role_oids)
              AND membership.grantor = installation_role_oid
       )
       OR EXISTS (
            SELECT 1
            FROM pg_catalog.pg_auth_members AS membership
            WHERE membership.member = ANY (target_role_oids)
       )
       OR EXISTS (
            SELECT 1
            FROM unnest(target_role_oids) AS target_role(role_oid)
            WHERE pg_catalog.pg_has_role(
                installation_role_oid,
                target_role.role_oid,
                'SET'
            )
               OR pg_catalog.pg_has_role(
                installation_role_oid,
                target_role.role_oid,
                'USAGE'
            )
       )
       OR pg_catalog.has_schema_privilege(
            core_owner_oid,
            public_schema_oid,
            'CREATE'
       )
       OR EXISTS (
            SELECT 1
            FROM pg_catalog.aclexplode(
                CASE
                    WHEN pg_catalog.array_ndims(
                        (
                            SELECT namespace_state.nspacl
                            FROM pg_catalog.pg_namespace AS namespace_state
                            WHERE namespace_state.oid = public_schema_oid
                        )
                    ) = 1 THEN (
                        SELECT namespace_state.nspacl
                        FROM pg_catalog.pg_namespace AS namespace_state
                        WHERE namespace_state.oid = public_schema_oid
                    )
                    ELSE NULL::pg_catalog.aclitem[]
                END
            ) AS acl_state
            WHERE acl_state.grantee = ANY (target_role_oids)
       )
       OR EXISTS (
            SELECT 1
            FROM pg_catalog.pg_class AS relation_state
            WHERE relation_state.oid = ANY (target_relation_oids)
              AND relation_state.relowner <> core_owner_oid
       ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15D bootstrap cleanup verification failed';
    END IF;
END
$bootstrap_cleanup_verification$;

DO $diagnostic$ BEGIN RAISE NOTICE 'P2D15P_433_FINAL_AUTOMATIC_MEMBERSHIP_CONTRACT_OK'; END $diagnostic$;

DO $verification$
DECLARE
    target_relation record;
    function_owner_oid oid;
    core_owner_oid oid;
    actual_privileges text[];
BEGIN
    SELECT role_state.oid
    INTO function_owner_oid
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname = 'afex_function_owner';

    SELECT role_state.oid
    INTO core_owner_oid
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname = 'afex_core_owner';

    FOR target_relation IN
        SELECT
            required_table.table_name,
            required_table.bootstrap_policy,
            required_table.production_policy,
            relation_state.oid AS relation_oid,
            relation_state.relowner,
            relation_state.relrowsecurity,
            relation_state.relforcerowsecurity,
            relation_state.relacl
        FROM (
            VALUES
                (
                    'atomic_authorization_contexts',
                    'atomic_authorization_contexts_owner_all',
                    'atomic_authorization_contexts_function_owner_all'
                ),
                (
                    'atomic_order_commands',
                    'atomic_order_commands_owner_all',
                    'atomic_order_commands_function_owner_all'
                )
        ) AS required_table(
            table_name,
            bootstrap_policy,
            production_policy
        )
        LEFT JOIN pg_catalog.pg_class AS relation_state
          ON relation_state.relname = required_table.table_name
         AND relation_state.relnamespace = (
             SELECT namespace_state.oid
             FROM pg_catalog.pg_namespace AS namespace_state
             WHERE namespace_state.nspname = 'public'
         )
         AND relation_state.relkind = 'r'
    LOOP
        IF target_relation.relation_oid IS NULL THEN
            RAISE EXCEPTION USING
                errcode = '55000',
                message = 'P2D.15D verification failed: required table is missing',
                detail = 'public.' || target_relation.table_name;
        END IF;

        IF target_relation.relowner <> core_owner_oid THEN
            RAISE EXCEPTION USING
                errcode = '55000',
                message = 'P2D.15D verification failed: table owner changed',
                detail = 'public.' || target_relation.table_name;
        END IF;

        IF NOT target_relation.relrowsecurity
           OR NOT target_relation.relforcerowsecurity THEN
            RAISE EXCEPTION USING
                errcode = '55000',
                message = 'P2D.15D verification failed: table RLS state is invalid',
                detail = 'public.' || target_relation.table_name;
        END IF;

        IF EXISTS (
            SELECT 1
            FROM pg_catalog.pg_policy AS policy_state
            WHERE policy_state.polrelid =
                  target_relation.relation_oid
              AND policy_state.polname =
                  target_relation.bootstrap_policy
        ) THEN
            RAISE EXCEPTION USING
                errcode = '55000',
                message = 'P2D.15D verification failed: bootstrap policy remains',
                detail = 'public.' || target_relation.table_name;
        END IF;

        IF (
            SELECT pg_catalog.count(*)
            FROM pg_catalog.pg_policy AS policy_state
            WHERE policy_state.polrelid =
                  target_relation.relation_oid
        ) <> 1 OR (
            SELECT pg_catalog.count(*)
            FROM pg_catalog.pg_policy AS policy_state
            WHERE policy_state.polrelid =
                  target_relation.relation_oid
              AND policy_state.polname =
                  target_relation.production_policy
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
        ) <> 1 THEN
            RAISE EXCEPTION USING
                errcode = '55000',
                message = 'P2D.15D verification failed: production policy contract mismatch',
                detail = 'public.' || target_relation.table_name;
        END IF;

        SELECT pg_catalog.array_agg(
            acl_state.privilege_type
            ORDER BY acl_state.privilege_type
        )
        INTO actual_privileges
        FROM pg_catalog.aclexplode(
            CASE
                WHEN pg_catalog.array_ndims(
                    target_relation.relacl
                ) = 1 THEN target_relation.relacl
                ELSE NULL::pg_catalog.aclitem[]
            END
        ) AS acl_state
        WHERE acl_state.grantee = function_owner_oid
          AND NOT acl_state.is_grantable
          AND acl_state.grantor = core_owner_oid;

        IF actual_privileges IS DISTINCT FROM
           ARRAY['INSERT', 'SELECT', 'UPDATE']::text[] THEN
            RAISE EXCEPTION USING
                errcode = '55000',
                message = 'P2D.15D verification failed: function-owner privileges mismatch',
                detail = 'public.' || target_relation.table_name;
        END IF;

        IF EXISTS (
            SELECT 1
            FROM pg_catalog.aclexplode(
                CASE
                    WHEN pg_catalog.array_ndims(
                        target_relation.relacl
                    ) = 1 THEN target_relation.relacl
                    ELSE NULL::pg_catalog.aclitem[]
                END
            ) AS acl_state
            WHERE acl_state.grantee = function_owner_oid
              AND (
                  acl_state.is_grantable
                  OR acl_state.grantor <> core_owner_oid
                  OR acl_state.privilege_type NOT IN (
                      'SELECT',
                      'INSERT',
                      'UPDATE'
                  )
              )
        ) THEN
            RAISE EXCEPTION USING
                errcode = '55000',
                message = 'P2D.15D verification failed: function-owner privilege is excessive',
                detail = 'public.' || target_relation.table_name;
        END IF;

        IF EXISTS (
            SELECT 1
            FROM pg_catalog.aclexplode(
                CASE
                    WHEN pg_catalog.array_ndims(
                        target_relation.relacl
                    ) = 1 THEN target_relation.relacl
                    ELSE NULL::pg_catalog.aclitem[]
                END
            ) AS acl_state
            WHERE acl_state.grantee = 0
               OR acl_state.grantee IN (
                  SELECT role_state.oid
                  FROM pg_catalog.pg_roles AS role_state
                  WHERE role_state.rolname IN (
                      'anon',
                      'authenticated',
                      'service_role',
                      'afex_core_runtime',
                      'afex_context_issuer',
                      'afex_outbox_worker'
                  )
               )
        ) THEN
            RAISE EXCEPTION USING
                errcode = '55000',
                message = 'P2D.15D verification failed: forbidden direct privilege exists',
                detail = 'public.' || target_relation.table_name;
        END IF;

        IF EXISTS (
            SELECT 1
            FROM pg_catalog.aclexplode(
                CASE
                    WHEN pg_catalog.array_ndims(
                        target_relation.relacl
                    ) = 1 THEN target_relation.relacl
                    ELSE NULL::pg_catalog.aclitem[]
                END
            ) AS acl_state
            WHERE acl_state.grantee NOT IN (
                core_owner_oid,
                function_owner_oid
            )
        ) THEN
            RAISE EXCEPTION USING
                errcode = '55000',
                message = 'P2D.15D verification failed: unexpected ACL grantee exists',
                detail = 'public.' || target_relation.table_name;
        END IF;

        IF EXISTS (
            SELECT 1
            FROM pg_catalog.pg_trigger AS trigger_state
            WHERE trigger_state.tgrelid =
                  target_relation.relation_oid
              AND NOT trigger_state.tgisinternal
        ) THEN
            RAISE EXCEPTION USING
                errcode = '55000',
                message = 'P2D.15D verification failed: unexpected table trigger exists',
                detail = 'public.' || target_relation.table_name;
        END IF;
    END LOOP;

    IF (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_class AS relation_state
        JOIN pg_catalog.pg_namespace AS namespace_state
          ON namespace_state.oid = relation_state.relnamespace
        WHERE namespace_state.nspname = 'public'
          AND relation_state.relname IN (
              'atomic_authorization_contexts',
              'atomic_order_commands'
          )
          AND relation_state.relkind = 'r'
    ) <> 2 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.15D verification failed: foundation table inventory changed';
    END IF;

    RAISE NOTICE 'P2D15G_440_P2D15D_VERIFICATION_OK';
END
$verification$;

SELECT
    relation_state.relname AS table_name,
    owner_role.rolname AS table_owner,
    relation_state.relrowsecurity AS rls_enabled,
    relation_state.relforcerowsecurity AS force_rls_enabled,
    policy_state.polname AS production_policy,
    policy_role.rolname AS policy_role,
    (
        SELECT pg_catalog.array_agg(
            acl_state.privilege_type
            ORDER BY acl_state.privilege_type
        )
        FROM pg_catalog.aclexplode(
            CASE
                WHEN pg_catalog.array_ndims(
                    relation_state.relacl
                ) = 1 THEN relation_state.relacl
                ELSE NULL::pg_catalog.aclitem[]
            END
        ) AS acl_state
        WHERE acl_state.grantee = policy_role.oid
          AND NOT acl_state.is_grantable
    ) AS function_owner_privileges
FROM pg_catalog.pg_class AS relation_state
JOIN pg_catalog.pg_namespace AS namespace_state
  ON namespace_state.oid = relation_state.relnamespace
JOIN pg_catalog.pg_roles AS owner_role
  ON owner_role.oid = relation_state.relowner
JOIN pg_catalog.pg_policy AS policy_state
  ON policy_state.polrelid = relation_state.oid
JOIN pg_catalog.pg_roles AS policy_role
  ON policy_role.oid = policy_state.polroles[1]
WHERE namespace_state.nspname = 'public'
  AND relation_state.relname IN (
      'atomic_authorization_contexts',
      'atomic_order_commands'
  )
  AND relation_state.relkind = 'r'
ORDER BY relation_state.relname;

DO $diagnostic$ BEGIN RAISE NOTICE 'P2D15G_900_PRECOMMIT_OK'; END $diagnostic$;

COMMIT;

SELECT 'P2D15G_999_COMMIT_REACHED' AS diagnostic_marker;

-- END OF P2D.15D FINAL PRIVILEGE CLOSURE & RLS REPLACEMENT
-- END OF P2D.15 FRESH FOUNDATION
