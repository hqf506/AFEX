-- 000 header and frozen contract
-- AFEX Core V2 A2.4E.2A disposable LOGIN creation.
-- PostgreSQL 17.6; standalone manual execution; not a migration.
-- Inputs are psql variables. Never enable command echo for this artifact.

-- 010 psql settings and fail-fast
\set ON_ERROR_STOP on
\set ECHO none
\set ECHO_HIDDEN off
\set QUIET on
\pset format unaligned
\pset tuples_only on
\pset pager off

-- 020 input capture
\if :{?disposable_role_name}
\else
  \set disposable_role_name ''
\endif
\if :{?disposable_role_scram_verifier}
\else
  \set disposable_role_scram_verifier ''
\endif
\if :{?valid_until_utc}
\else
  \set valid_until_utc ''
\endif
\if :{?expected_database_name}
\else
  \set expected_database_name ''
\endif
\if :{?expected_project_reference}
\else
  \set expected_project_reference ''
\endif
\if :{?actual_project_reference}
\else
  \set actual_project_reference ''
\endif
\if :{?expected_postgres_major}
\else
  \set expected_postgres_major ''
\endif
\if :{?expected_runtime_role_name}
\else
  \set expected_runtime_role_name ''
\endif
\if :{?expected_runtime_role_oid}
\else
  \set expected_runtime_role_oid ''
\endif
\if :{?expected_target_regprocedure}
\else
  \set expected_target_regprocedure ''
\endif
\if :{?expected_target_oid}
\else
  \set expected_target_oid ''
\endif
\if :{?expected_function_owner}
\else
  \set expected_function_owner ''
\endif
\if :{?run_id}
\else
  \set run_id ''
\endif
\if :{?contract_version}
\else
  \set contract_version 'A2.4E.2A-v1'
\endif

-- 030 input validation
-- 040 environment preflight
-- 050 runtime-role and target-function preflight
-- Validations are repeated under the transaction lock in section 060.

-- 060 transaction begin and serialization
BEGIN;

SELECT pg_catalog.format(
$a24e2a_template$
DO $a24e2a$
DECLARE
    v_role_name text := %1$L;
    v_scram_verifier text := %2$L;
    v_valid_until_text text := %3$L;
    v_expected_database text := %4$L;
    v_project_ref text := %5$L;
    v_expected_major integer;
    v_runtime_name text := %7$L;
    v_runtime_oid oid;
    v_expected_runtime_oid oid;
    v_target_signature text := %9$L;
    v_target_oid oid;
    v_expected_target_oid oid;
    v_function_owner text := %11$L;
    v_run_id text := %12$L;
    v_contract_version text := %13$L;
    v_connection_host text := %14$L;
    v_connection_user text := %15$L;
    v_actual_project_ref text := %16$L;
    v_valid_until timestamp with time zone;
    v_name_timestamp timestamp without time zone;
    v_created_oid oid;
    v_runtime_before jsonb;
    v_target_acl_before aclitem[];
    v_target_owner_before oid;
    v_database_acl_before aclitem[];
    v_public_acl_before aclitem[];
    v_membership_count bigint;
    v_installer_oid oid;
    v_installer_is_superuser boolean;
    v_self_grant_setting text;
    v_expected_creator_membership_count integer;
    v_scram_fields text[];
    v_salt_bytes bytea;
    v_stored_key_bytes bytea;
    v_server_key_bytes bytea;
    v_error_sqlstate text;
    v_error_message text;
    v_error_context text;
    v_safe_error_message text;
    v_safe_error_context text;
BEGIN
    -- 030 input validation
    IF v_role_name !~ '^afex_core_test_login_[0-9]{14}_[0-9a-f]{8}$'
       OR v_role_name <> pg_catalog.lower(v_role_name)
       OR v_role_name !~ '^[a-z0-9_]+$'
       OR v_role_name ~ '[[:space:]]'
       OR pg_catalog.octet_length(v_role_name) > 63 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_ROLE_NAME';
    END IF;

    BEGIN
        v_name_timestamp := pg_catalog.to_timestamp(
            pg_catalog.substring(v_role_name, 22, 14),
            'YYYYMMDDHH24MISS'
        )::timestamp without time zone;
        IF pg_catalog.to_char(v_name_timestamp, 'YYYYMMDDHH24MISS') <>
           pg_catalog.substring(v_role_name, 22, 14) THEN
            RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_ROLE_NAME';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_ROLE_NAME';
    END;

    IF v_scram_verifier IS NULL OR v_scram_verifier = '' THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'VERIFIER_TRANSPORT_PRECONDITION_FAILED';
    END IF;

    IF pg_catalog.length(v_scram_verifier) <> 133
       OR pg_catalog.octet_length(v_scram_verifier) <> 133
       OR v_scram_verifier ~ '[[:space:][:cntrl:]]' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SCRAM_FORMAT_FAILED';
    END IF;

    v_scram_fields := pg_catalog.regexp_match(
        v_scram_verifier,
        '^SCRAM-SHA-256\$4096:([A-Za-z0-9+/]{22}==)\$([A-Za-z0-9+/]{43}=):([A-Za-z0-9+/]{43}=)$'
    );

    IF v_scram_fields IS NULL OR pg_catalog.cardinality(v_scram_fields) <> 3 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SCRAM_FORMAT_FAILED';
    END IF;

    BEGIN
        v_salt_bytes := pg_catalog.decode(v_scram_fields[1], 'base64');
        v_stored_key_bytes := pg_catalog.decode(v_scram_fields[2], 'base64');
        v_server_key_bytes := pg_catalog.decode(v_scram_fields[3], 'base64');
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SCRAM_VALIDATION_FAILED';
    END;

    IF pg_catalog.octet_length(v_salt_bytes) <> 16
       OR pg_catalog.octet_length(v_stored_key_bytes) <> 32
       OR pg_catalog.octet_length(v_server_key_bytes) <> 32
       OR pg_catalog.encode(v_salt_bytes, 'base64') <> v_scram_fields[1]
       OR pg_catalog.encode(v_stored_key_bytes, 'base64') <> v_scram_fields[2]
       OR pg_catalog.encode(v_server_key_bytes, 'base64') <> v_scram_fields[3] THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SCRAM_VALIDATION_FAILED';
    END IF;

    BEGIN
        v_expected_major := %6$L::integer;
        v_expected_runtime_oid := %8$L::oid;
        v_expected_target_oid := %10$L::oid;
        v_valid_until := v_valid_until_text::timestamp with time zone;
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ROLE_CREATE_FAILED';
    END;

    IF v_valid_until IS NULL
       OR NOT pg_catalog.isfinite(v_valid_until)
       OR v_valid_until <= pg_catalog.transaction_timestamp()
       OR v_valid_until > pg_catalog.transaction_timestamp() + interval '4 hours'
       OR v_valid_until < pg_catalog.transaction_timestamp() - interval '5 minutes' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_EXPIRATION';
    END IF;

    IF v_run_id IS NULL OR v_run_id = '' OR pg_catalog.octet_length(v_run_id) > 96
       OR v_run_id !~ '^[A-Za-z0-9._:-]+$'
       OR v_contract_version <> 'A2.4E.2A-v1' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ROLE_CREATE_FAILED';
    END IF;

    IF v_project_ref IS NULL
       OR v_project_ref = ''
       OR v_project_ref !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
       OR v_actual_project_ref IS NULL
       OR v_actual_project_ref = ''
       OR v_project_ref IS DISTINCT FROM v_actual_project_ref THEN
        RAISE EXCEPTION USING
            ERRCODE = '55000',
            MESSAGE = 'WRONG_PROJECT',
            DETAIL = pg_catalog.format(
                'expected_project_reference=%s; actual_project_reference=%s; comparison_source=RUNNER_LOCAL_ENVIRONMENT_BINDING',
                coalesce(v_project_ref, '<null>'),
                coalesce(v_actual_project_ref, '<null>')
            );
    END IF;

    -- 040 environment preflight
    IF pg_catalog.current_database() IS DISTINCT FROM v_expected_database THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'WRONG_DATABASE';
    END IF;

    IF v_expected_major <> 17
       OR pg_catalog.current_setting('server_version_num')::integer / 10000 <> v_expected_major THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'POSTGRES_VERSION_MISMATCH';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_roles AS installer
        WHERE installer.rolname = CURRENT_USER
          AND (installer.rolsuper OR installer.rolcreaterole)
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ROLE_CREATE_FAILED';
    END IF;

    SELECT installer.oid, installer.rolsuper
    INTO v_installer_oid, v_installer_is_superuser
    FROM pg_catalog.pg_roles AS installer
    WHERE installer.rolname = CURRENT_USER;

    v_self_grant_setting := pg_catalog.current_setting('createrole_self_grant');
    IF v_self_grant_setting NOT IN ('', 'set', 'inherit', 'set, inherit', 'inherit, set') THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'UNEXPECTED_PREEXISTING_MEMBERSHIP';
    END IF;

    v_expected_creator_membership_count :=
        CASE
            WHEN NOT v_installer_is_superuser AND v_self_grant_setting <> '' THEN 1
            ELSE 0
        END;

    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = v_role_name) THEN
        RAISE EXCEPTION USING ERRCODE = '42710', MESSAGE = 'ROLE_ALREADY_EXISTS';
    END IF;

    -- 050 runtime-role and target-function preflight
    SELECT r.oid, pg_catalog.to_jsonb(r)
    INTO v_runtime_oid, v_runtime_before
    FROM pg_catalog.pg_roles AS r
    WHERE r.rolname = v_runtime_name;

    IF v_runtime_oid IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '42704', MESSAGE = 'RUNTIME_ROLE_MISSING';
    END IF;

    IF v_runtime_name <> 'afex_core_runtime'
       OR v_runtime_oid <> v_expected_runtime_oid
       OR NOT EXISTS (
           SELECT 1 FROM pg_catalog.pg_roles AS r
           WHERE r.oid = v_runtime_oid
             AND NOT r.rolcanlogin AND NOT r.rolinherit AND NOT r.rolsuper
             AND NOT r.rolcreatedb AND NOT r.rolcreaterole
             AND NOT r.rolreplication AND NOT r.rolbypassrls
       ) THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'RUNTIME_ROLE_IDENTITY_MISMATCH';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_catalog.pg_auth_members AS m
        WHERE m.roleid = v_runtime_oid OR m.member = v_runtime_oid
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'UNEXPECTED_PREEXISTING_MEMBERSHIP';
    END IF;

    v_target_oid := pg_catalog.to_regprocedure(v_target_signature);
    IF v_target_oid IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '42883', MESSAGE = 'TARGET_FUNCTION_MISSING';
    END IF;

    SELECT p.proacl, p.proowner
    INTO v_target_acl_before, v_target_owner_before
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = p.proowner
    WHERE p.oid = v_target_oid
      AND p.oid = v_expected_target_oid
      AND owner_role.rolname = v_function_owner
      AND p.prosecdef
      AND p.proconfig = ARRAY['search_path=pg_catalog']::text[];

    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'TARGET_FUNCTION_IDENTITY_MISMATCH';
    END IF;

    IF v_target_acl_before IS NOT NULL
       AND pg_catalog.cardinality(v_target_acl_before) > 0
       AND pg_catalog.array_ndims(v_target_acl_before) <> 1 THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'TARGET_FUNCTION_ACL_MISMATCH';
    END IF;

    IF NOT pg_catalog.has_function_privilege(v_runtime_oid, v_target_oid, 'EXECUTE')
       OR (
           SELECT pg_catalog.count(*)
           FROM pg_catalog.aclexplode(
               CASE
                   WHEN v_target_acl_before IS NOT NULL
                    AND pg_catalog.cardinality(v_target_acl_before) > 0
                    AND pg_catalog.array_ndims(v_target_acl_before) = 1
                   THEN v_target_acl_before
                   ELSE NULL::aclitem[]
               END
           ) AS runtime_acl
           WHERE runtime_acl.grantee = v_runtime_oid
             AND runtime_acl.privilege_type = 'EXECUTE'
             AND NOT runtime_acl.is_grantable
       ) <> 1
       OR EXISTS (
           SELECT 1
           FROM pg_catalog.aclexplode(
               CASE
                   WHEN v_target_acl_before IS NOT NULL
                    AND pg_catalog.cardinality(v_target_acl_before) > 0
                    AND pg_catalog.array_ndims(v_target_acl_before) = 1
                   THEN v_target_acl_before
                   ELSE NULL::aclitem[]
               END
           ) AS public_acl
           WHERE public_acl.grantee = 0
             AND public_acl.privilege_type = 'EXECUTE'
       )
       OR EXISTS (
           SELECT 1
           FROM pg_catalog.aclexplode(
               CASE
                   WHEN v_target_acl_before IS NOT NULL
                    AND pg_catalog.cardinality(v_target_acl_before) > 0
                    AND pg_catalog.array_ndims(v_target_acl_before) = 1
                   THEN v_target_acl_before
                   ELSE NULL::aclitem[]
               END
           ) AS acl
           WHERE acl.grantee NOT IN (v_runtime_oid, v_target_owner_before)
       ) THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'TARGET_FUNCTION_ACL_MISMATCH';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_auth_members AS m
        WHERE m.roleid = v_runtime_oid
          AND m.member = (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = CURRENT_USER)
          AND m.admin_option
    ) AND NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_roles AS installer
        WHERE installer.rolname = CURRENT_USER AND installer.rolsuper
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MEMBERSHIP_GRANT_FAILED';
    END IF;

    SELECT d.datacl INTO v_database_acl_before
    FROM pg_catalog.pg_database AS d WHERE d.datname = pg_catalog.current_database();
    SELECT n.nspacl INTO v_public_acl_before
    FROM pg_catalog.pg_namespace AS n WHERE n.nspname = 'public';

    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('AFEX:A2.4E.2A:CREATE:' || v_runtime_oid::text, 0)
    );

    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = v_role_name)
       OR (SELECT pg_catalog.to_jsonb(r) FROM pg_catalog.pg_roles AS r WHERE r.oid = v_runtime_oid)
          IS DISTINCT FROM v_runtime_before THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'ROLE_ALREADY_EXISTS';
    END IF;

    -- 070 create disposable LOGIN
    BEGIN
        EXECUTE pg_catalog.format(
            'CREATE ROLE %%I LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 1 PASSWORD %%L VALID UNTIL %%L',
            v_role_name,
            v_scram_verifier,
            v_valid_until_text
        );
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS
            v_error_sqlstate = RETURNED_SQLSTATE,
            v_error_message = MESSAGE_TEXT,
            v_error_context = PG_EXCEPTION_CONTEXT;
        v_safe_error_message := pg_catalog.left(
            pg_catalog.replace(
                coalesce(v_error_message, ''),
                v_scram_verifier,
                '[REDACTED_SECRET]'
            ),
            512
        );
        v_safe_error_context := pg_catalog.left(
            pg_catalog.replace(
                coalesce(v_error_context, ''),
                v_scram_verifier,
                '[REDACTED_SECRET]'
            ),
            512
        );
        v_scram_verifier := NULL;
        v_scram_fields := NULL;
        v_salt_bytes := NULL;
        v_stored_key_bytes := NULL;
        v_server_key_bytes := NULL;
        RAISE EXCEPTION USING
            ERRCODE = '55000',
            MESSAGE = 'ROLE_CREATE_FAILED',
            DETAIL = pg_catalog.format(
                'stage=CREATE_ROLE; original_sqlstate=%s; original_sqlerrm=%s',
                v_error_sqlstate,
                v_safe_error_message
            ),
            HINT = pg_catalog.format(
                'original_context=%s',
                v_safe_error_context
            );
    END;
    v_scram_verifier := NULL;
    v_scram_fields := NULL;
    v_salt_bytes := NULL;
    v_stored_key_bytes := NULL;
    v_server_key_bytes := NULL;

    SELECT oid INTO v_created_oid FROM pg_catalog.pg_roles WHERE rolname = v_role_name;

    -- 080 grant SET-only membership
    BEGIN
        EXECUTE pg_catalog.format(
            'GRANT %%I TO %%I WITH ADMIN FALSE, INHERIT FALSE, SET TRUE',
            v_runtime_name,
            v_role_name
        );
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'MEMBERSHIP_GRANT_FAILED';
    END;

    -- 090 post-create assertions
    IF v_created_oid IS NULL OR NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_roles AS r
        WHERE r.oid = v_created_oid AND r.rolname = v_role_name
          AND r.rolcanlogin AND NOT r.rolinherit AND NOT r.rolsuper
          AND NOT r.rolcreatedb AND NOT r.rolcreaterole
          AND NOT r.rolreplication AND NOT r.rolbypassrls
          AND r.rolconnlimit = 1
          AND r.rolvaliduntil IS NOT DISTINCT FROM v_valid_until
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'POST_CREATE_ASSERTION_FAILED';
    END IF;

    SELECT pg_catalog.count(*) INTO v_membership_count
    FROM pg_catalog.pg_auth_members AS m
    WHERE m.roleid = v_runtime_oid AND m.member = v_created_oid
      AND NOT m.admin_option AND NOT m.inherit_option AND m.set_option;

    IF v_membership_count <> 1
       OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_auth_members AS m
           WHERE m.roleid = v_created_oid AND m.member = v_runtime_oid) <> 0
       OR (
           SELECT pg_catalog.count(*)
           FROM pg_catalog.pg_auth_members AS m
           WHERE m.roleid = v_created_oid
             AND m.member = v_installer_oid
             AND m.admin_option
             AND m.inherit_option = (pg_catalog.position('inherit', v_self_grant_setting) > 0)
             AND m.set_option = (pg_catalog.position('set', v_self_grant_setting) > 0)
       ) <> v_expected_creator_membership_count
       OR EXISTS (
           SELECT 1
           FROM pg_catalog.pg_auth_members AS m
           WHERE (m.roleid = v_created_oid OR m.member = v_created_oid)
             AND NOT (
                 m.roleid = v_runtime_oid
                 AND m.member = v_created_oid
                 AND NOT m.admin_option
                 AND NOT m.inherit_option
                 AND m.set_option
             )
             AND NOT (
                 v_expected_creator_membership_count = 1
                 AND m.roleid = v_created_oid
                 AND m.member = v_installer_oid
                 AND m.admin_option
                 AND m.inherit_option =
                     (pg_catalog.position('inherit', v_self_grant_setting) > 0)
                 AND m.set_option =
                     (pg_catalog.position('set', v_self_grant_setting) > 0)
             )
       )
       OR EXISTS (
           SELECT 1
           FROM pg_catalog.pg_auth_members AS m
           WHERE m.member = v_created_oid
             AND m.roleid <> v_runtime_oid
             AND (m.admin_option OR m.inherit_option OR m.set_option)
       ) THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'POST_CREATE_ASSERTION_FAILED';
    END IF;

    IF EXISTS (
        WITH RECURSIVE inherited(roleid) AS (
            SELECT m.roleid FROM pg_catalog.pg_auth_members AS m
            WHERE m.member = v_created_oid AND m.inherit_option
          UNION
            SELECT m.roleid FROM inherited AS i
            JOIN pg_catalog.pg_auth_members AS m ON m.member = i.roleid
            WHERE m.inherit_option
        ) SELECT 1 FROM inherited
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'POST_CREATE_ASSERTION_FAILED';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_catalog.pg_db_role_setting WHERE setrole = v_created_oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_database WHERE datdba = v_created_oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspowner = v_created_oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE relowner = v_created_oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc WHERE proowner = v_created_oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_type WHERE typowner = v_created_oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_default_acl WHERE defaclrole = v_created_oid) THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'POST_CREATE_ASSERTION_FAILED';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_catalog.pg_namespace
        WHERE nspacl IS NOT NULL AND pg_catalog.cardinality(nspacl) > 0
          AND pg_catalog.array_ndims(nspacl) <> 1
    ) OR EXISTS (
        SELECT 1 FROM pg_catalog.pg_class
        WHERE relacl IS NOT NULL AND pg_catalog.cardinality(relacl) > 0
          AND pg_catalog.array_ndims(relacl) <> 1
    ) OR EXISTS (
        SELECT 1 FROM pg_catalog.pg_proc
        WHERE proacl IS NOT NULL AND pg_catalog.cardinality(proacl) > 0
          AND pg_catalog.array_ndims(proacl) <> 1
    ) OR EXISTS (
        SELECT 1 FROM pg_catalog.pg_attribute
        WHERE attacl IS NOT NULL AND pg_catalog.cardinality(attacl) > 0
          AND pg_catalog.array_ndims(attacl) <> 1
    ) OR EXISTS (
        SELECT 1 FROM pg_catalog.pg_database
        WHERE datacl IS NOT NULL AND pg_catalog.cardinality(datacl) > 0
          AND pg_catalog.array_ndims(datacl) <> 1
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'POST_CREATE_ASSERTION_FAILED';
    END IF;

    IF EXISTS (
        SELECT 1 FROM pg_catalog.pg_namespace AS n
        CROSS JOIN LATERAL pg_catalog.aclexplode(
            CASE WHEN n.nspacl IS NOT NULL AND pg_catalog.cardinality(n.nspacl) > 0
                      AND pg_catalog.array_ndims(n.nspacl) = 1
                 THEN n.nspacl ELSE NULL::aclitem[] END
        ) AS acl WHERE acl.grantee = v_created_oid
    ) OR EXISTS (
        SELECT 1 FROM pg_catalog.pg_class AS c
        CROSS JOIN LATERAL pg_catalog.aclexplode(
            CASE WHEN c.relacl IS NOT NULL AND pg_catalog.cardinality(c.relacl) > 0
                      AND pg_catalog.array_ndims(c.relacl) = 1
                 THEN c.relacl ELSE NULL::aclitem[] END
        ) AS acl WHERE acl.grantee = v_created_oid
    ) OR EXISTS (
        SELECT 1 FROM pg_catalog.pg_proc AS p
        CROSS JOIN LATERAL pg_catalog.aclexplode(
            CASE WHEN p.proacl IS NOT NULL AND pg_catalog.cardinality(p.proacl) > 0
                      AND pg_catalog.array_ndims(p.proacl) = 1
                 THEN p.proacl ELSE NULL::aclitem[] END
        ) AS acl WHERE acl.grantee = v_created_oid
    ) OR EXISTS (
        SELECT 1 FROM pg_catalog.pg_attribute AS a
        CROSS JOIN LATERAL pg_catalog.aclexplode(
            CASE WHEN a.attacl IS NOT NULL AND pg_catalog.cardinality(a.attacl) > 0
                      AND pg_catalog.array_ndims(a.attacl) = 1
                 THEN a.attacl ELSE NULL::aclitem[] END
        ) AS acl WHERE acl.grantee = v_created_oid
    ) OR EXISTS (
        SELECT 1 FROM pg_catalog.pg_database AS d
        CROSS JOIN LATERAL pg_catalog.aclexplode(
            CASE WHEN d.datacl IS NOT NULL AND pg_catalog.cardinality(d.datacl) > 0
                      AND pg_catalog.array_ndims(d.datacl) = 1
                 THEN d.datacl ELSE NULL::aclitem[] END
        ) AS acl WHERE acl.grantee = v_created_oid AND acl.privilege_type = 'CREATE'
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'UNEXPECTED_PREEXISTING_GRANT';
    END IF;

    IF (SELECT pg_catalog.to_jsonb(r) FROM pg_catalog.pg_roles AS r WHERE r.oid = v_runtime_oid)
          IS DISTINCT FROM v_runtime_before
       OR (SELECT p.proacl FROM pg_catalog.pg_proc AS p WHERE p.oid = v_target_oid)
          IS DISTINCT FROM v_target_acl_before
       OR (SELECT p.proowner FROM pg_catalog.pg_proc AS p WHERE p.oid = v_target_oid)
          IS DISTINCT FROM v_target_owner_before
       OR (SELECT d.datacl FROM pg_catalog.pg_database AS d
           WHERE d.datname = pg_catalog.current_database()) IS DISTINCT FROM v_database_acl_before
       OR (SELECT n.nspacl FROM pg_catalog.pg_namespace AS n
           WHERE n.nspname = 'public') IS DISTINCT FROM v_public_acl_before THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'POST_CREATE_ASSERTION_FAILED';
    END IF;
END
$a24e2a$;
$a24e2a_template$,
    :'disposable_role_name',
    :'disposable_role_scram_verifier',
    :'valid_until_utc',
    :'expected_database_name',
    :'expected_project_reference',
    :'expected_postgres_major',
    :'expected_runtime_role_name',
    :'expected_runtime_role_oid',
    :'expected_target_regprocedure',
    :'expected_target_oid',
    :'expected_function_owner',
    :'run_id',
    :'contract_version',
    :'HOST',
    :'USER',
    :'actual_project_reference'
) \gexec

\unset disposable_role_scram_verifier

-- 100 safe result output
SELECT
    :'run_id'::text AS run_id,
    role_state.rolname AS role_name,
    role_state.oid AS role_oid,
    pg_catalog.to_char(
        role_state.rolvaliduntil AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ) AS valid_until_utc,
    runtime_state.rolname AS runtime_role_name,
    runtime_state.oid AS runtime_role_oid,
    runtime_state.rolname || '->' || role_state.rolname AS membership_direction,
    membership_state.admin_option,
    membership_state.inherit_option,
    membership_state.set_option,
    'assertions_passed_pending_commit'::text AS transaction_state,
    'CREATED_PENDING_COMMIT'::text AS result
FROM pg_catalog.pg_roles AS role_state
JOIN pg_catalog.pg_auth_members AS membership_state
  ON membership_state.member = role_state.oid
JOIN pg_catalog.pg_roles AS runtime_state
  ON runtime_state.oid = membership_state.roleid
WHERE role_state.rolname = :'disposable_role_name'
  AND runtime_state.oid = :'expected_runtime_role_oid'::oid;

-- 120 commit
COMMIT;

-- 110 completion marker (emitted after the section-120 commit intentionally)
SELECT 'A24E2A_900_DISPOSABLE_LOGIN_CREATE_COMPLETE';

-- 900 failure semantics and operator notes
-- ON_ERROR_STOP terminates after any server error; PostgreSQL rolls back the open
-- transaction when the session ends or the wrapper explicitly rolls it back.
-- The marker is deliberately emitted after COMMIT. It proves that psql continued
-- past the commit; success additionally requires psql exit zero, COMMIT evidence,
-- the marker, and the independent role attestation.
-- Creation is not blindly retry-safe. A connection loss after mutation is
-- UNKNOWN_OUTCOME_CLEANUP_REQUIRED. Prove absence or run attestation/cleanup before
-- retry. Never overwrite a collision. Cleanup is mandatory after any possibly
-- committed creation.
-- TRANSACTION_ROLLED_BACK is wrapper-owned after confirmed rollback evidence.
-- UNKNOWN_OUTCOME_CLEANUP_REQUIRED is wrapper-owned after ambiguous transport.
-- UNEXPECTED_PREEXISTING_GRANT is SQL-owned by direct-ACL preflight/assertion.
