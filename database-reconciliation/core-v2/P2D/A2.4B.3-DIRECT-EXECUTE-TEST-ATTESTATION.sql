-- A2.4B.3 read-only disposable direct-EXECUTE attestation
\set ON_ERROR_STOP on
BEGIN TRANSACTION READ ONLY;

SELECT 'A24B3_210_LOGIN_CONTRACT_BEGIN' AS marker;

DO $attestation$
DECLARE
    login_state pg_catalog.pg_roles%ROWTYPE;
    login_oid oid;
    function_oid oid := pg_catalog.to_regprocedure('public.afex_core_direct_execute_probe_v1()');
    function_owner_oid oid := pg_catalog.to_regrole('afex_function_owner');
    runtime_oid oid := pg_catalog.to_regrole('afex_core_runtime');
    public_oid oid := pg_catalog.to_regnamespace('public');
    denied_table_oid oid := pg_catalog.to_regclass('public.afex_core_direct_execute_denied_table_v1');
    denied_sequence_oid oid := pg_catalog.to_regclass('public.afex_core_direct_execute_denied_sequence_v1');
BEGIN
    SELECT * INTO login_state
    FROM pg_catalog.pg_roles
    WHERE rolname = 'afex_core_direct_execute_test_login';
    login_oid := login_state.oid;

    IF login_oid IS NULL OR NOT login_state.rolcanlogin OR login_state.rolinherit
       OR login_state.rolsuper OR login_state.rolbypassrls
       OR login_state.rolcreatedb OR login_state.rolcreaterole
       OR login_state.rolreplication OR login_state.rolconnlimit <> 2
       OR login_state.rolvaliduntil IS NULL
       OR login_state.rolvaliduntil <= pg_catalog.statement_timestamp() THEN
        RAISE EXCEPTION 'A2.4B.3 LOGIN attribute contract failed';
    END IF;

    IF EXISTS (
        WITH RECURSIVE membership_path(roleid, member) AS (
            SELECT roleid, member FROM pg_catalog.pg_auth_members
            UNION
            SELECT membership.roleid, path.member
            FROM pg_catalog.pg_auth_members AS membership
            JOIN membership_path AS path ON path.roleid = membership.member
        )
        SELECT 1 FROM membership_path
        WHERE roleid = login_oid OR member = login_oid
    ) THEN
        RAISE EXCEPTION 'A2.4B.3 LOGIN direct or transitive membership contract failed';
    END IF;

    IF pg_catalog.pg_has_role(login_oid, runtime_oid, 'MEMBER')
       OR pg_catalog.pg_has_role(runtime_oid, login_oid, 'MEMBER') THEN
        RAISE EXCEPTION 'A2.4B.3 afex_core_runtime inheritance path exists';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspowner = login_oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE relowner = login_oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc WHERE proowner = login_oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_database WHERE datdba = login_oid) THEN
        RAISE EXCEPTION 'A2.4B.3 LOGIN owns a schema, relation, sequence, function, or database';
    END IF;

    IF function_oid IS NULL OR denied_table_oid IS NULL OR denied_sequence_oid IS NULL THEN
        RAISE EXCEPTION 'A2.4B.3 required disposable object missing';
    END IF;

    IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc
        WHERE pronamespace = public_oid AND proname = 'afex_core_direct_execute_probe_v1') <> 1 THEN
        RAISE EXCEPTION 'A2.4B.3 probe overload inventory failed';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc AS procedure_state
        WHERE procedure_state.oid = function_oid
          AND procedure_state.proowner = function_owner_oid
          AND procedure_state.prosecdef
          AND procedure_state.prokind = 'f'
          AND procedure_state.pronargs = 0
          AND procedure_state.prorettype = 'record'::pg_catalog.regtype
          AND procedure_state.proallargtypes = ARRAY[
              'name'::pg_catalog.regtype,
              'name'::pg_catalog.regtype,
              'integer'::pg_catalog.regtype,
              'bigint'::pg_catalog.regtype,
              'text'::pg_catalog.regtype
          ]::oid[]
          AND procedure_state.proargmodes = ARRAY['t','t','t','t','t']::pg_catalog."char"[]
          AND procedure_state.proargnames = ARRAY[
              'caller_session_user',
              'effective_function_user',
              'backend_pid',
              'transaction_id',
              'probe_value'
          ]::text[]
          AND pg_catalog.pg_get_function_identity_arguments(procedure_state.oid) = ''
          AND procedure_state.proconfig IS NOT NULL
          AND procedure_state.proconfig @> ARRAY['search_path=pg_catalog']::text[]
          AND pg_catalog.cardinality(procedure_state.proconfig) = 1
    ) THEN
        RAISE EXCEPTION 'A2.4B.3 probe signature, owner, SECURITY DEFINER, or search_path failed';
    END IF;

    IF (SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_proc AS procedure_state
        CROSS JOIN LATERAL pg_catalog.aclexplode(procedure_state.proacl) AS acl
        WHERE procedure_state.oid = function_oid) <> 1
       OR NOT EXISTS (
            SELECT 1
            FROM pg_catalog.pg_proc AS procedure_state
            CROSS JOIN LATERAL pg_catalog.aclexplode(procedure_state.proacl) AS acl
            WHERE procedure_state.oid = function_oid
              AND acl.grantee = login_oid
              AND acl.grantor = function_owner_oid
              AND acl.privilege_type = 'EXECUTE'
              AND NOT acl.is_grantable
       ) THEN
        RAISE EXCEPTION 'A2.4B.3 exact direct EXECUTE ACL inventory failed';
    END IF;

    IF NOT pg_catalog.has_function_privilege(login_oid, function_oid, 'EXECUTE')
       OR NOT pg_catalog.has_function_privilege(function_owner_oid, function_oid, 'EXECUTE')
       OR pg_catalog.has_function_privilege('anon', function_oid, 'EXECUTE')
       OR pg_catalog.has_function_privilege('authenticated', function_oid, 'EXECUTE')
       OR pg_catalog.has_function_privilege('service_role', function_oid, 'EXECUTE') THEN
        RAISE EXCEPTION 'A2.4B.3 effective probe EXECUTE contract failed';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_default_acl AS default_acl
        CROSS JOIN LATERAL pg_catalog.aclexplode(default_acl.defaclacl) AS acl
        WHERE default_acl.defaclnamespace IN (0, public_oid)
          AND default_acl.defaclobjtype = 'f'
          AND acl.privilege_type = 'EXECUTE'
          AND acl.grantee IN (0, login_oid)
    ) THEN
        RAISE EXCEPTION 'A2.4B.3 default ACL could grant function EXECUTE';
    END IF;

    IF pg_catalog.has_schema_privilege(login_oid, public_oid, 'CREATE') THEN
        RAISE EXCEPTION 'A2.4B.3 LOGIN has schema CREATE';
    END IF;

    IF NOT pg_catalog.has_schema_privilege(login_oid, public_oid, 'USAGE') THEN
        RAISE EXCEPTION 'A2.4B.3 LOGIN lacks required public schema USAGE';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute AS attribute_state
        WHERE attribute_state.attrelid IN (denied_table_oid, denied_sequence_oid)
          AND attribute_state.attnum > 0
          AND NOT attribute_state.attisdropped
          AND attribute_state.attacl IS NOT NULL
    ) OR EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute AS attribute_state
        CROSS JOIN LATERAL pg_catalog.aclexplode(attribute_state.attacl) AS acl
        WHERE attribute_state.attrelid IN (denied_table_oid, denied_sequence_oid)
          AND attribute_state.attnum > 0
          AND NOT attribute_state.attisdropped
    ) THEN
        RAISE EXCEPTION 'A2.4B.3 complete direct column ACL inventory is not empty/NULL';
    END IF;

    IF pg_catalog.has_table_privilege(login_oid, denied_table_oid,
            'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       OR pg_catalog.has_sequence_privilege(login_oid, denied_sequence_oid,
            'USAGE,SELECT,UPDATE') THEN
        RAISE EXCEPTION 'A2.4B.3 disposable denial object is reachable';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class AS relation_state
        JOIN pg_catalog.pg_namespace AS namespace_state
          ON namespace_state.oid = relation_state.relnamespace
        WHERE relation_state.relkind IN ('r','p','v','m','f')
          AND namespace_state.nspname NOT IN ('pg_catalog', 'information_schema')
          AND NOT namespace_state.nspname LIKE 'pg_toast%'
          AND pg_catalog.has_table_privilege(login_oid, relation_state.oid,
              'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    ) THEN
        RAISE EXCEPTION 'A2.4B.3 LOGIN has unexpected effective relation privilege';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class AS sequence_state
        JOIN pg_catalog.pg_namespace AS namespace_state
          ON namespace_state.oid = sequence_state.relnamespace
        WHERE sequence_state.relkind = 'S'
          AND namespace_state.nspname NOT IN ('pg_catalog', 'information_schema')
          AND NOT namespace_state.nspname LIKE 'pg_toast%'
          AND pg_catalog.has_sequence_privilege(login_oid, sequence_state.oid, 'USAGE,SELECT,UPDATE')
    ) THEN
        RAISE EXCEPTION 'A2.4B.3 LOGIN has unexpected effective sequence privilege';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc AS procedure_state
        JOIN pg_catalog.pg_namespace AS namespace_state
          ON namespace_state.oid = procedure_state.pronamespace
        WHERE procedure_state.oid <> function_oid
          AND namespace_state.nspname NOT IN ('pg_catalog', 'information_schema')
          AND NOT namespace_state.nspname LIKE 'pg_toast%'
          AND pg_catalog.has_function_privilege(login_oid, procedure_state.oid, 'EXECUTE')
    ) THEN
        RAISE EXCEPTION 'A2.4B.3 LOGIN can execute an unrelated function';
    END IF;

    IF pg_catalog.has_function_privilege(
        login_oid,
        'public.acquire_atomic_order_command_v1(uuid,uuid,uuid,text,text,text,text,timestamptz)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'A2.4B.3 test LOGIN can execute P2D.20';
    END IF;
END
$attestation$;

SELECT 'A24B3_220_LOGIN_ATTRIBUTES_MEMBERSHIP_OWNERSHIP_PASS' AS marker;
SELECT 'A24B3_230_PROBE_SIGNATURE_AND_EXECUTE_ACL_PASS' AS marker;
SELECT 'A24B3_240_RELATION_COLUMN_SEQUENCE_SCHEMA_DENIAL_PASS' AS marker;
SELECT 'A24B3_250_UNRELATED_FUNCTION_AND_RUNTIME_MEMBERSHIP_DENIAL_PASS' AS marker;
SELECT 'A24B3_900_DISPOSABLE_DIRECT_EXECUTE_ATTESTATION_OK' AS marker;
ROLLBACK;
