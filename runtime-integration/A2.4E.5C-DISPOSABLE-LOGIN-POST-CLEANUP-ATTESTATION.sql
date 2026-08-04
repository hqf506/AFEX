\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned
\pset pager off

BEGIN TRANSACTION READ ONLY;

SELECT pg_catalog.set_config('a24e.disposable_role_name', :'disposable_role_name', true),
       pg_catalog.set_config('a24e.expected_database_name', :'expected_database_name', true),
       pg_catalog.set_config('a24e.expected_postgres_major', :'expected_postgres_major', true),
       pg_catalog.set_config('a24e.expected_disposable_role_oid', :'expected_disposable_role_oid', true);

DO $a24e5c$
DECLARE
    v_oid oid := pg_catalog.current_setting('a24e.expected_disposable_role_oid')::oid;
BEGIN
    IF pg_catalog.current_setting('a24e.expected_postgres_major') <> '17'
       OR pg_catalog.current_setting('server_version_num')::integer / 10000 <> 17 THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'POSTGRES_MAJOR_MISMATCH';
    END IF;
    IF pg_catalog.current_database() <> pg_catalog.current_setting('a24e.expected_database_name')
       OR pg_catalog.current_setting('a24e.disposable_role_name') !~ '^afex_core_test_login_[0-9]{14}_[0-9a-f]{8}$'
       OR pg_catalog.current_setting('a24e.expected_disposable_role_oid') !~ '^[1-9][0-9]*$' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'POST_CLEANUP_IDENTITY_INPUT_INVALID';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles AS r
               WHERE r.rolname = pg_catalog.current_setting('a24e.disposable_role_name') OR r.oid = v_oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_stat_activity AS a
                  WHERE a.usesysid = v_oid OR a.usename = pg_catalog.current_setting('a24e.disposable_role_name'))
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_auth_members AS m
                  WHERE m.member = v_oid OR m.roleid = v_oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_class AS c WHERE c.relowner = v_oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc AS p WHERE p.proowner = v_oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_namespace AS n WHERE n.nspowner = v_oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_type AS t WHERE t.typowner = v_oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_database AS d WHERE d.datdba = v_oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_tablespace AS t WHERE t.spcowner = v_oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_default_acl AS d WHERE d.defaclrole = v_oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_db_role_setting AS s WHERE s.setrole = v_oid)
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_shdepend AS d
                  WHERE d.refclassid = 'pg_catalog.pg_authid'::pg_catalog.regclass
                    AND d.refobjid = v_oid)
       OR EXISTS (
           SELECT 1 FROM pg_catalog.pg_class AS c
           CROSS JOIN LATERAL pg_catalog.unnest(c.relacl) AS stored(acl_item)
           CROSS JOIN LATERAL pg_catalog.aclexplode(ARRAY[stored.acl_item]) AS x
           WHERE x.grantee = v_oid OR x.grantor = v_oid
       )
       OR EXISTS (
           SELECT 1 FROM pg_catalog.pg_proc AS p
           CROSS JOIN LATERAL pg_catalog.unnest(p.proacl) AS stored(acl_item)
           CROSS JOIN LATERAL pg_catalog.aclexplode(ARRAY[stored.acl_item]) AS x
           WHERE x.grantee = v_oid OR x.grantor = v_oid
       )
       OR EXISTS (
           SELECT 1 FROM pg_catalog.pg_namespace AS n
           CROSS JOIN LATERAL pg_catalog.unnest(n.nspacl) AS stored(acl_item)
           CROSS JOIN LATERAL pg_catalog.aclexplode(ARRAY[stored.acl_item]) AS x
           WHERE x.grantee = v_oid OR x.grantor = v_oid
       )
       OR EXISTS (
           SELECT 1 FROM pg_catalog.pg_attribute AS a
           CROSS JOIN LATERAL pg_catalog.unnest(a.attacl) AS stored(acl_item)
           CROSS JOIN LATERAL pg_catalog.aclexplode(ARRAY[stored.acl_item]) AS x
           WHERE x.grantee = v_oid OR x.grantor = v_oid
       ) THEN
        RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'POST_CLEANUP_RESIDUE_DETECTED';
    END IF;
END
$a24e5c$;

SELECT 'A24E5C_RESULT|' || :'run_id' || '|' || :'disposable_role_name' || '|' || :'expected_disposable_role_oid' || '|PASS';

ROLLBACK;

SELECT 'A24E5C_900_DISPOSABLE_LOGIN_POST_CLEANUP_ATTESTATION_COMPLETE';
