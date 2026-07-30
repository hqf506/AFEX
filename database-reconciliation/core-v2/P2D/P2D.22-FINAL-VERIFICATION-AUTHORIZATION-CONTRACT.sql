BEGIN TRANSACTION READ ONLY;

-- AFEX Core V2 P2D.22 - Final Authorization Contract Verification
-- Verification only. No migration, repair, GRANT, REVOKE, or business read.

DO $verification$
DECLARE
    mismatch_detail text;
BEGIN
    IF pg_catalog.current_setting('server_version_num')::integer <> 170006
       OR pg_catalog.current_setting('server_encoding') <> 'UTF8'
       OR pg_catalog.current_setting('transaction_read_only') <> 'on' THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.22 verification environment mismatch';
    END IF;

    IF (
        SELECT pg_catalog.count(*)
        FROM pg_catalog.pg_roles
        WHERE rolname IN (
            'postgres', 'anon', 'authenticated', 'service_role',
            'afex_function_owner'
        )
    ) <> 5 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.22 required real-role inventory mismatch';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class AS relation_state
        JOIN pg_catalog.pg_namespace AS namespace_state
          ON namespace_state.oid = relation_state.relnamespace
        WHERE namespace_state.nspname = 'public'
          AND relation_state.relname IN ('profiles', 'tenants', 'branches')
          AND relation_state.relacl IS NOT NULL
          AND (
              pg_catalog.cardinality(relation_state.relacl) > 0
              AND pg_catalog.array_ndims(relation_state.relacl)
                  IS DISTINCT FROM 1
              OR pg_catalog.array_ndims(relation_state.relacl) = 1
              AND pg_catalog.array_position(
                  relation_state.relacl, NULL::aclitem
              ) IS NOT NULL
          )
    ) OR EXISTS (
        SELECT 1
        FROM pg_catalog.pg_attribute AS attribute_state
        WHERE attribute_state.attrelid IN (
            pg_catalog.to_regclass('public.profiles'),
            pg_catalog.to_regclass('public.tenants'),
            pg_catalog.to_regclass('public.branches')
        )
          AND attribute_state.attnum > 0
          AND NOT attribute_state.attisdropped
          AND attribute_state.attacl IS NOT NULL
          AND (
              pg_catalog.cardinality(attribute_state.attacl) > 0
              AND pg_catalog.array_ndims(attribute_state.attacl)
                  IS DISTINCT FROM 1
              OR pg_catalog.array_ndims(attribute_state.attacl) = 1
              AND pg_catalog.array_position(
                  attribute_state.attacl, NULL::aclitem
              ) IS NOT NULL
          )
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.22 malformed direct ACL array';
    END IF;

    WITH expected(
        schema_name, table_name, column_name, grantor, grantee,
        privilege_type, is_grantable
    ) AS (
        VALUES
            ('public','profiles','id','postgres','afex_function_owner','SELECT',false),
            ('public','profiles','tenant_id','postgres','afex_function_owner','SELECT',false),
            ('public','profiles','branch_id','postgres','afex_function_owner','SELECT',false),
            ('public','profiles','role','postgres','afex_function_owner','SELECT',false),
            ('public','profiles','is_active','postgres','afex_function_owner','SELECT',false),
            ('public','profiles','updated_at','postgres','afex_function_owner','SELECT',false),
            ('public','tenants','id','postgres','afex_function_owner','SELECT',false),
            ('public','branches','id','postgres','afex_function_owner','SELECT',false),
            ('public','branches','tenant_id','postgres','afex_function_owner','SELECT',false),
            ('public','branches','is_active','postgres','afex_function_owner','SELECT',false),
            ('public','branches','deleted_at','postgres','afex_function_owner','SELECT',false),
            ('public','profiles','branch_id','postgres','authenticated','SELECT',false),
            ('public','profiles','contact_email','postgres','authenticated','SELECT',false),
            ('public','profiles','contact_email','postgres','authenticated','UPDATE',false),
            ('public','profiles','full_name','postgres','authenticated','SELECT',false),
            ('public','profiles','full_name','postgres','authenticated','UPDATE',false),
            ('public','profiles','id','postgres','authenticated','SELECT',false),
            ('public','profiles','is_active','postgres','authenticated','SELECT',false),
            ('public','profiles','phone','postgres','authenticated','SELECT',false),
            ('public','profiles','phone','postgres','authenticated','UPDATE',false),
            ('public','profiles','role','postgres','authenticated','SELECT',false),
            ('public','profiles','tenant_id','postgres','authenticated','SELECT',false),
            ('public','profiles','tenant_name','postgres','authenticated','SELECT',false),
            ('public','profiles','updated_at','postgres','authenticated','UPDATE',false),
            ('public','profiles','username','postgres','authenticated','SELECT',false)
    ),
    actual AS (
        SELECT
            namespace_state.nspname::text,
            relation_state.relname::text,
            attribute_state.attname::text,
            CASE WHEN acl_state.grantor = 0 THEN 'PUBLIC'
                 ELSE pg_catalog.pg_get_userbyid(acl_state.grantor)::text END,
            CASE WHEN acl_state.grantee = 0 THEN 'PUBLIC'
                 ELSE pg_catalog.pg_get_userbyid(acl_state.grantee)::text END,
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
        WHERE namespace_state.nspname = 'public'
          AND relation_state.relname IN ('profiles', 'tenants', 'branches')
          AND attribute_state.attnum > 0
          AND NOT attribute_state.attisdropped
    ),
    differences AS (
        (SELECT * FROM expected EXCEPT SELECT * FROM actual)
        UNION ALL
        (SELECT * FROM actual EXCEPT SELECT * FROM expected)
    )
    SELECT pg_catalog.string_agg(
        pg_catalog.concat_ws(
            '.', schema_name, table_name, column_name, grantor, grantee,
            privilege_type, is_grantable::text
        ),
        ', ' ORDER BY schema_name, table_name, column_name, grantee,
                     privilege_type
    )
    INTO mismatch_detail
    FROM differences;

    IF mismatch_detail IS NOT NULL THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.22 direct column ACL exact-set mismatch',
            detail = mismatch_detail;
    END IF;

    WITH expected AS (
        SELECT
            'public'::text AS schema_name,
            table_name,
            'postgres'::text AS grantor,
            grantee,
            privilege_type,
            false AS is_grantable
        FROM (VALUES ('profiles'::text), ('tenants'), ('branches'))
             AS tables(table_name)
        CROSS JOIN (
            VALUES ('postgres'::text), ('anon'), ('authenticated'),
                   ('service_role')
        ) AS grantees(grantee)
        CROSS JOIN (
            VALUES ('SELECT'::text), ('INSERT'), ('UPDATE'), ('DELETE'),
                   ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')
        ) AS privileges(privilege_type)
    ),
    actual AS (
        SELECT
            namespace_state.nspname::text,
            relation_state.relname::text,
            CASE WHEN acl_state.grantor = 0 THEN 'PUBLIC'
                 ELSE pg_catalog.pg_get_userbyid(acl_state.grantor)::text END,
            CASE WHEN acl_state.grantee = 0 THEN 'PUBLIC'
                 ELSE pg_catalog.pg_get_userbyid(acl_state.grantee)::text END,
            acl_state.privilege_type::text,
            acl_state.is_grantable
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
          AND relation_state.relname IN ('profiles', 'tenants', 'branches')
    ),
    differences AS (
        (SELECT * FROM expected EXCEPT SELECT * FROM actual)
        UNION ALL
        (SELECT * FROM actual EXCEPT SELECT * FROM expected)
    )
    SELECT pg_catalog.string_agg(
        pg_catalog.concat_ws(
            '.', schema_name, table_name, grantor, grantee,
            privilege_type, is_grantable::text
        ),
        ', ' ORDER BY schema_name, table_name, grantee, privilege_type
    )
    INTO mismatch_detail
    FROM differences;

    IF mismatch_detail IS NOT NULL THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.22 direct table ACL exact-set mismatch',
            detail = mismatch_detail;
    END IF;

    WITH expected(table_name, rls_enabled, force_rls) AS (
        VALUES
            ('profiles'::text, true, false),
            ('tenants', true, false),
            ('branches', true, false)
    ),
    actual AS (
        SELECT
            relation_state.relname::text,
            relation_state.relrowsecurity,
            relation_state.relforcerowsecurity
        FROM pg_catalog.pg_class AS relation_state
        JOIN pg_catalog.pg_namespace AS namespace_state
          ON namespace_state.oid = relation_state.relnamespace
        WHERE namespace_state.nspname = 'public'
          AND relation_state.relname IN ('profiles', 'tenants', 'branches')
    ),
    differences AS (
        (SELECT * FROM expected EXCEPT SELECT * FROM actual)
        UNION ALL
        (SELECT * FROM actual EXCEPT SELECT * FROM expected)
    )
    SELECT pg_catalog.string_agg(
        table_name || ':' || rls_enabled::text || ':' || force_rls::text,
        ', ' ORDER BY table_name
    )
    INTO mismatch_detail
    FROM differences;

    IF mismatch_detail IS NOT NULL THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.22 RLS/FORCE RLS exact-set mismatch',
            detail = mismatch_detail;
    END IF;

    WITH expected(
        table_name, policy_name, command_code, permissive, role_name,
        using_expression, with_check_expression
    ) AS (
        VALUES
            ('branches'::text,'branches_insert_same_tenant','a',true,
             'authenticated',NULL::text,
             'tenant_id = current_profile_tenant_id()'),
            ('branches','branches_select_same_tenant','r',true,
             'authenticated','tenant_id = current_profile_tenant_id()',NULL),
            ('branches','branches_update_same_tenant','w',true,
             'authenticated','tenant_id = current_profile_tenant_id()',
             'tenant_id = current_profile_tenant_id()'),
            ('branches',
             'core_v2_function_owner_branches_authorization_read','r',true,
             'afex_function_owner','true',NULL),
            ('profiles',
             'core_v2_function_owner_profiles_authorization_read','r',true,
             'afex_function_owner','true',NULL),
            ('profiles','profiles_select_admin_override','r',true,
             'authenticated',
             'tenant_id = current_profile_tenant_id() AND current_profile_role() = ''admin''::text',
             NULL),
            ('profiles','profiles_select_own','r',true,'authenticated',
             'auth.uid() = id',NULL),
            ('profiles','profiles_select_same_tenant','r',true,
             'authenticated','tenant_id = current_profile_tenant_id()',NULL),
            ('profiles','profiles_select_self','r',true,'authenticated',
             'id = auth.uid()',NULL),
            ('profiles','profiles_update_own','w',true,'authenticated',
             'auth.uid() = id','auth.uid() = id'),
            ('profiles','profiles_update_self','w',true,'authenticated',
             'id = auth.uid()','id = auth.uid()'),
            ('tenants',
             'core_v2_function_owner_tenants_authorization_read','r',true,
             'afex_function_owner','true',NULL)
    ),
    actual AS (
        SELECT
            relation_state.relname::text,
            policy_state.polname::text,
            policy_state.polcmd::text,
            policy_state.polpermissive,
            CASE WHEN policy_state.polroles = ARRAY[0::oid] THEN 'PUBLIC'
                 WHEN pg_catalog.cardinality(policy_state.polroles) = 1
                 THEN pg_catalog.pg_get_userbyid(policy_state.polroles[1])::text
                 ELSE '<MULTIPLE_ROLES>' END,
            pg_catalog.pg_get_expr(
                policy_state.polqual, policy_state.polrelid, true
            ),
            pg_catalog.pg_get_expr(
                policy_state.polwithcheck, policy_state.polrelid, true
            )
        FROM pg_catalog.pg_policy AS policy_state
        JOIN pg_catalog.pg_class AS relation_state
          ON relation_state.oid = policy_state.polrelid
        JOIN pg_catalog.pg_namespace AS namespace_state
          ON namespace_state.oid = relation_state.relnamespace
        WHERE namespace_state.nspname = 'public'
          AND relation_state.relname IN ('profiles', 'tenants', 'branches')
    ),
    differences AS (
        (SELECT * FROM expected EXCEPT SELECT * FROM actual)
        UNION ALL
        (SELECT * FROM actual EXCEPT SELECT * FROM expected)
    )
    SELECT pg_catalog.string_agg(
        pg_catalog.concat_ws(
            '.', table_name, policy_name, command_code, permissive::text,
            role_name, using_expression, with_check_expression
        ),
        ', ' ORDER BY table_name, policy_name
    )
    INTO mismatch_detail
    FROM differences;

    IF mismatch_detail IS NOT NULL THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.22 policy exact-set mismatch',
            detail = mismatch_detail;
    END IF;
END
$verification$;

SELECT 'P2D22_900_AUTHORIZATION_CONTRACT_VERIFICATION_OK' AS marker;

ROLLBACK;
