\set ON_ERROR_STOP on
\ir P2D.22-FINAL-VERIFICATION-AUTHORIZATION-CONTRACT.sql

BEGIN TRANSACTION READ ONLY;

-- AFEX Core V2 P2D.21D - Final Production Read-Only Verification
-- No business function is invoked. No order or payload is created.

DO $verification$
DECLARE
    required_relation text;
    required_policy record;
    forbidden_role text;
    acquisition_oid oid;
    canonicalizer_oid oid;
    function_owner_oid oid;
BEGIN
    IF pg_catalog.current_setting('server_version_num')::integer <> 170006 THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.21D verification requires exact PostgreSQL 17.6 (170006)';
    END IF;

    IF pg_catalog.current_setting('server_encoding') IS DISTINCT FROM 'UTF8'
       OR pg_catalog.current_setting('transaction_read_only')
          IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.21D verification environment mismatch';
    END IF;

    FOREACH required_relation IN ARRAY ARRAY[
        'public.atomic_authorization_contexts',
        'public.atomic_order_commands',
        'public.atomic_order_command_payloads',
        'public.profiles',
        'public.tenants',
        'public.branches'
    ]::text[]
    LOOP
        IF pg_catalog.to_regclass(required_relation) IS NULL THEN
            RAISE EXCEPTION USING
                errcode = '55000',
                message = 'P2D.21D required relation is missing',
                detail = required_relation;
        END IF;
    END LOOP;

    SELECT role_state.oid
    INTO function_owner_oid
    FROM pg_catalog.pg_roles AS role_state
    WHERE role_state.rolname = 'afex_function_owner';

    acquisition_oid := pg_catalog.to_regprocedure(
        'public.acquire_atomic_order_command_v1(uuid,uuid,uuid,text,text,text,text,timestamp with time zone)'
    );
    canonicalizer_oid := pg_catalog.to_regprocedure(
        'public.canonicalize_atomic_order_json_v1(jsonb)'
    );

    IF function_owner_oid IS NULL
       OR acquisition_oid IS NULL
       OR canonicalizer_oid IS NULL THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.21D role or function contract is missing';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class AS relation_state
        JOIN pg_catalog.pg_namespace AS namespace_state
          ON namespace_state.oid = relation_state.relnamespace
        WHERE namespace_state.nspname = 'public'
          AND relation_state.relname IN (
              'atomic_authorization_contexts',
              'atomic_order_commands',
              'atomic_order_command_payloads'
          )
          AND (
              relation_state.relowner <>
                  (SELECT oid FROM pg_catalog.pg_roles
                   WHERE rolname = 'afex_core_owner')
              OR NOT relation_state.relrowsecurity
              OR NOT relation_state.relforcerowsecurity
          )
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.21D ownership or RLS contract mismatch';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc AS procedure_state
        WHERE procedure_state.oid IN (acquisition_oid, canonicalizer_oid)
          AND (
              procedure_state.proowner <> function_owner_oid
              OR procedure_state.proconfig IS DISTINCT FROM
                 ARRAY['search_path=pg_catalog']::text[]
          )
    )
    OR NOT (
        SELECT procedure_state.prosecdef
        FROM pg_catalog.pg_proc AS procedure_state
        WHERE procedure_state.oid = acquisition_oid
    )
    OR (
        SELECT procedure_state.prosecdef
        FROM pg_catalog.pg_proc AS procedure_state
        WHERE procedure_state.oid = canonicalizer_oid
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.21D function owner, definer, or search_path mismatch';
    END IF;

    IF (
        SELECT pg_catalog.encode(
            pg_catalog.sha256(
                pg_catalog.convert_to(
                    pg_catalog.btrim(
                        pg_catalog.regexp_replace(
                            procedure_state.prosrc,
                            E'\\s+',
                            ' ',
                            'g'
                        )
                    ),
                    'UTF8'
                )
            ),
            'hex'
        )
        FROM pg_catalog.pg_proc AS procedure_state
        WHERE procedure_state.oid = canonicalizer_oid
    ) IS DISTINCT FROM
      'e3f5d8c53f673254e5529ceaf54c8e18640e550109db230ddc902a1e8584c2da'
    OR (
        SELECT pg_catalog.encode(
            pg_catalog.sha256(
                pg_catalog.convert_to(
                    pg_catalog.btrim(
                        pg_catalog.regexp_replace(
                            procedure_state.prosrc,
                            E'\\s+',
                            ' ',
                            'g'
                        )
                    ),
                    'UTF8'
                )
            ),
            'hex'
        )
        FROM pg_catalog.pg_proc AS procedure_state
        WHERE procedure_state.oid = acquisition_oid
    ) IS DISTINCT FROM
      '721dc8d635a1fc7682073c1ec70cad71759367ce3bc21ad15b63803974c756d6'
    THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.21D exact function-source hash mismatch';
    END IF;

    IF NOT pg_catalog.has_function_privilege(
        'afex_core_runtime',
        acquisition_oid,
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.21D runtime EXECUTE contract is absent';
    END IF;

    FOREACH forbidden_role IN ARRAY ARRAY[
        'public',
        'anon',
        'authenticated',
        'service_role',
        'afex_context_issuer',
        'afex_outbox_worker'
    ]::text[]
    LOOP
        IF pg_catalog.has_function_privilege(
            forbidden_role,
            acquisition_oid,
            'EXECUTE'
        ) THEN
            RAISE EXCEPTION USING
                errcode = '55000',
                message = 'P2D.21D forbidden acquisition EXECUTE exists',
                detail = forbidden_role;
        END IF;
    END LOOP;

    FOREACH forbidden_role IN ARRAY ARRAY[
        'public',
        'anon',
        'authenticated',
        'service_role',
        'afex_core_owner',
        'afex_core_runtime',
        'afex_context_issuer',
        'afex_outbox_worker'
    ]::text[]
    LOOP
        IF pg_catalog.has_function_privilege(
            forbidden_role,
            canonicalizer_oid,
            'EXECUTE'
        ) THEN
            RAISE EXCEPTION USING
                errcode = '55000',
                message = 'P2D.21D forbidden canonicalizer EXECUTE exists',
                detail = forbidden_role;
        END IF;
    END LOOP;

    FOR required_policy IN
        SELECT *
        FROM (
            VALUES
                ('atomic_authorization_contexts',
                 'atomic_authorization_contexts_function_owner_all', '*'),
                ('atomic_order_commands',
                 'atomic_order_commands_function_owner_all', '*'),
                ('atomic_order_command_payloads',
                 'atomic_order_command_payloads_function_owner_all', '*'),
                ('profiles',
                 'core_v2_function_owner_profiles_authorization_read', 'r'),
                ('tenants',
                 'core_v2_function_owner_tenants_authorization_read', 'r'),
                ('branches',
                 'core_v2_function_owner_branches_authorization_read', 'r')
        ) AS expected(table_name, policy_name, command_code)
    LOOP
        IF (
            SELECT pg_catalog.count(*)
            FROM pg_catalog.pg_policy AS policy_state
            WHERE policy_state.polrelid =
                  pg_catalog.to_regclass(
                      'public.' || required_policy.table_name
                  )
              AND policy_state.polname = required_policy.policy_name
              AND policy_state.polcmd = required_policy.command_code
              AND policy_state.polpermissive
              AND policy_state.polroles = ARRAY[function_owner_oid]::oid[]
        ) <> 1 THEN
            RAISE EXCEPTION USING
                errcode = '55000',
                message = 'P2D.21D exact policy contract mismatch',
                detail = required_policy.policy_name;
        END IF;
    END LOOP;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class AS relation_state
        JOIN pg_catalog.pg_namespace AS namespace_state
          ON namespace_state.oid = relation_state.relnamespace
        WHERE namespace_state.nspname = 'public'
          AND relation_state.relname IN (
              'atomic_authorization_contexts',
              'atomic_order_commands',
              'atomic_order_command_payloads'
          )
          AND relation_state.relacl IS NOT NULL
          AND (CASE
              WHEN pg_catalog.cardinality(relation_state.relacl) > 0
                   AND pg_catalog.array_ndims(relation_state.relacl)
                       IS DISTINCT FROM 1
                  THEN true
              WHEN pg_catalog.array_ndims(relation_state.relacl) = 1
                  THEN pg_catalog.array_position(
                      relation_state.relacl,
                      NULL::aclitem
                  ) IS NOT NULL
              ELSE false
          END)
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.21D malformed ledger table ACL array';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_class AS relation_state
        JOIN pg_catalog.pg_namespace AS namespace_state
          ON namespace_state.oid = relation_state.relnamespace
        CROSS JOIN LATERAL pg_catalog.unnest(
            COALESCE(
                relation_state.relacl,
                pg_catalog.acldefault('r', relation_state.relowner)
            )
        ) AS acl_item(value)
        CROSS JOIN LATERAL pg_catalog.aclexplode(
            ARRAY[acl_item.value]::aclitem[]
        ) AS acl_state
        WHERE namespace_state.nspname = 'public'
          AND relation_state.relname IN (
              'atomic_authorization_contexts',
              'atomic_order_commands',
              'atomic_order_command_payloads'
          )
          AND acl_state.grantee NOT IN (
              relation_state.relowner,
              function_owner_oid
          )
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.21D unexpected ledger table ACL exists';
    END IF;

    -- The superseding P2D.22 verifier, included before this transaction,
    -- performs the exact direct table ACL, direct column ACL, RLS, FORCE RLS,
    -- and policy set comparisons. The former blanket non-function-owner
    -- rejection was intentionally removed because it rejected the reviewed
    -- authenticated application column contract.

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_trigger AS trigger_state
        WHERE trigger_state.tgrelid =
              pg_catalog.to_regclass(
                  'public.atomic_order_command_payloads'
              )
          AND NOT trigger_state.tgisinternal
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.21D unexpected payload trigger exists';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.atomic_authorization_contexts AS context_state
        LEFT JOIN public.atomic_order_commands AS command_state
          ON command_state.authorization_context_id = context_state.id
        WHERE command_state.id IS NULL
    )
    OR EXISTS (
        SELECT 1
        FROM public.atomic_order_commands AS command_state
        LEFT JOIN public.atomic_order_command_payloads AS payload_state
          ON payload_state.command_id = command_state.id
        WHERE payload_state.command_id IS NULL
    )
    OR EXISTS (
        SELECT 1
        FROM public.atomic_order_command_payloads AS payload_state
        LEFT JOIN public.atomic_order_commands AS command_state
          ON command_state.id = payload_state.command_id
        WHERE command_state.id IS NULL
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.21D orphan ledger artifact exists';
    END IF;

    IF pg_catalog.to_regprocedure('pg_advisory_xact_lock(bigint)') IS NULL
       OR pg_catalog.to_regprocedure('hashtextextended(text,bigint)') IS NULL
       OR pg_catalog.to_regprocedure('sha256(bytea)') IS NULL
       OR pg_catalog.to_regprocedure('normalize(text,text)') IS NULL THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.21D required PostgreSQL dependency is absent';
    END IF;
END
$verification$;

SELECT
    CURRENT_USER AS current_user,
    SESSION_USER AS session_user,
    pg_catalog.current_database() AS database_name,
    pg_catalog.current_setting('server_version') AS server_version,
    pg_catalog.current_setting('server_version_num') AS server_version_num,
    pg_catalog.current_setting('server_encoding') AS server_encoding,
    pg_catalog.current_setting('transaction_read_only')
        AS transaction_read_only;

DO $verification$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM (VALUES
            ('afex_core_owner'::text),
            ('afex_function_owner'::text)
        ) AS expected(role_name)
        JOIN pg_catalog.pg_roles AS target_role
          ON target_role.rolname = expected.role_name
        CROSS JOIN pg_catalog.pg_roles AS installer
        CROSS JOIN pg_catalog.pg_roles AS baseline_grantor
        WHERE installer.rolname = 'postgres'
          AND baseline_grantor.rolname = 'supabase_admin'
          AND (
              (
                  SELECT pg_catalog.count(*)
                  FROM pg_catalog.pg_auth_members AS membership
                  WHERE membership.roleid = target_role.oid
                    AND membership.member = installer.oid
              ) <> 1
              OR (
                  SELECT pg_catalog.count(*)
                  FROM pg_catalog.pg_auth_members AS membership
                  WHERE membership.roleid = target_role.oid
                     OR membership.member = target_role.oid
              ) <> 1
              OR NOT EXISTS (
                  SELECT 1
                  FROM pg_catalog.pg_auth_members AS membership
                  WHERE membership.roleid = target_role.oid
                    AND membership.member = installer.oid
                    AND membership.grantor = baseline_grantor.oid
                    AND membership.admin_option
                    AND NOT membership.inherit_option
                    AND NOT membership.set_option
              )
              OR EXISTS (
                  SELECT 1
                  FROM pg_catalog.pg_auth_members AS membership
                  WHERE membership.roleid = target_role.oid
                    AND membership.member = installer.oid
                    AND membership.grantor = installer.oid
              )
              OR pg_catalog.has_schema_privilege(
                  expected.role_name, 'public', 'CREATE'
              )
              OR EXISTS (
                  SELECT 1
                  FROM pg_catalog.pg_namespace AS namespace_state
                  CROSS JOIN LATERAL pg_catalog.unnest(
                      namespace_state.nspacl
                  ) AS acl_item(value)
                  CROSS JOIN LATERAL pg_catalog.aclexplode(
                      ARRAY[acl_item.value]::aclitem[]
                  ) AS acl_state
                  WHERE namespace_state.nspname = 'public'
                    AND acl_state.grantee = target_role.oid
              )
          )
    ) THEN
        RAISE EXCEPTION USING
            errcode = '55000',
            message = 'P2D.21D failed: bootstrap authority residue exists';
    END IF;

    RAISE NOTICE 'P2D21D_900_POST_INSTALL_VERIFICATION_OK';
END
$verification$;

SELECT
    'PASS'::text AS verification_result,
    'P2D21D_900_POST_INSTALL_VERIFICATION_OK'::text AS final_marker;

ROLLBACK;

-- END OF P2D.21D POST-INSTALL READ-ONLY VERIFICATION
