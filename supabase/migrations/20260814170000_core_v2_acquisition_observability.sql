BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SELECT pg_catalog.pg_advisory_xact_lock(506, 22504);

DO $preflight$
BEGIN
  IF SESSION_USER <> 'postgres' OR CURRENT_USER <> 'postgres' THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'OBSERVABILITY_INSTALLER_IDENTITY_INVALID';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_auth_members AS membership
    JOIN pg_catalog.pg_roles AS granted_role ON granted_role.oid = membership.roleid
    JOIN pg_catalog.pg_roles AS member_role ON member_role.oid = membership.member
    WHERE granted_role.rolname = 'afex_function_owner'
      AND member_role.rolname = 'postgres'
  ) THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'OBSERVABILITY_TEMPORARY_MEMBERSHIP_PREEXISTS';
  END IF;
  IF (
    SELECT owner_role.rolname
    FROM pg_catalog.pg_proc AS function_state
    JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = function_state.proowner
    WHERE function_state.oid = 'public.acquire_atomic_order_command_result_v1(uuid,uuid,uuid,text,text,text,text,timestamp with time zone)'::pg_catalog.regprocedure
  ) IS DISTINCT FROM 'afex_function_owner' THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'OBSERVABILITY_BASELINE_OWNER_INVALID';
  END IF;
END $preflight$;

GRANT afex_function_owner TO postgres
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE
  GRANTED BY postgres;
SET LOCAL ROLE afex_function_owner;

CREATE OR REPLACE FUNCTION public.acquire_atomic_order_command_result_v1(
  p_authenticated_actor_id uuid,
  p_tenant_id uuid,
  p_branch_id uuid,
  p_idempotency_key text,
  p_correlation_reference text,
  p_canonical_payload text,
  p_fingerprint_projection text,
  p_retain_until timestamp with time zone
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
PARALLEL UNSAFE
SECURITY DEFINER
SET search_path = pg_catalog
AS $facade$
DECLARE
  x record;
  v_failure_phase text := 'FACADE_VALIDATION';
  v_safe_sqlstate text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles AS profile_state
    JOIN public.branches AS branch_state
      ON branch_state.id = p_branch_id
     AND branch_state.tenant_id = p_tenant_id
     AND branch_state.is_active
     AND branch_state.deleted_at IS NULL
    WHERE profile_state.id = p_authenticated_actor_id
      AND profile_state.tenant_id = p_tenant_id
      AND profile_state.is_active
      AND profile_state.role IN ('owner', 'admin', 'manager', 'employee', 'cashier')
      AND (profile_state.branch_id IS NULL OR profile_state.branch_id = p_branch_id)
  ) THEN
    RETURN pg_catalog.jsonb_build_object(
      'responseVersion', 'atomic-order-result-v1',
      'result', 'failed',
      'errorCode', 'UNAUTHORIZED'
    );
  END IF;

  v_failure_phase := 'INTERNAL_ACQUISITION';
  SELECT * INTO x
  FROM afex_core_private.acquire_atomic_order_command_internal_v1(
    p_authenticated_actor_id,
    p_tenant_id,
    p_branch_id,
    p_idempotency_key,
    p_correlation_reference,
    p_canonical_payload,
    p_fingerprint_projection,
    p_retain_until
  );

  v_failure_phase := 'RESULT_CONSTRUCTION';
  IF x.acquisition_result = 'created'
     AND x.command_status = 'reserved'
     AND x.error_code IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'responseVersion', 'atomic-order-result-v1',
      'result', 'created',
      'commandId', x.atomic_command_id
    );
  ELSIF x.acquisition_result = 'in_progress'
        AND x.command_status IN ('reserved', 'processing')
        AND x.error_code IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'responseVersion', 'atomic-order-result-v1',
      'result', 'in_progress',
      'commandId', x.atomic_command_id
    );
  ELSIF x.acquisition_result = 'replay'
        AND x.command_status = 'succeeded'
        AND x.response_version = 'atomic-order-result-v1'
        AND x.response_snapshot IS NOT NULL
        AND x.completed_at IS NOT NULL
        AND x.error_code IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'responseVersion', 'atomic-order-result-v1',
      'result', 'replay',
      'commandId', x.atomic_command_id,
      'responseSnapshot', x.response_snapshot
    );
  ELSIF x.acquisition_result = 'fingerprint_conflict' THEN
    RETURN pg_catalog.jsonb_build_object(
      'responseVersion', 'atomic-order-result-v1',
      'result', 'fingerprint_conflict',
      'errorCode', 'FINGERPRINT_CONFLICT'
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'responseVersion', 'atomic-order-result-v1',
    'result', 'failed',
    'errorCode', 'INTERNAL_ERROR',
    'safeSqlState', 'P0001',
    'failurePhase', 'RESULT_CONSTRUCTION'
  );
EXCEPTION
WHEN query_canceled THEN
  GET STACKED DIAGNOSTICS v_safe_sqlstate = RETURNED_SQLSTATE;
  RETURN pg_catalog.jsonb_build_object(
    'responseVersion', 'atomic-order-result-v1',
    'result', 'failed',
    'errorCode', 'INTERNAL_ERROR',
    'safeSqlState', v_safe_sqlstate,
    'failurePhase', CASE
      WHEN v_failure_phase IN (
        'FACADE_VALIDATION',
        'INTERNAL_ACQUISITION',
        'AUTHORIZATION_CONTEXT_INSERT',
        'COMMAND_INSERT',
        'PAYLOAD_INSERT',
        'AUDIT_INSERT',
        'RESULT_CONSTRUCTION',
        'UNKNOWN_INTERNAL'
      ) THEN v_failure_phase
      ELSE 'UNKNOWN_INTERNAL'
    END
  );
WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_safe_sqlstate = RETURNED_SQLSTATE;
  RETURN pg_catalog.jsonb_build_object(
    'responseVersion', 'atomic-order-result-v1',
    'result', 'failed',
    'errorCode', 'INTERNAL_ERROR',
    'safeSqlState', v_safe_sqlstate,
    'failurePhase', CASE
      WHEN v_failure_phase IN (
        'FACADE_VALIDATION',
        'INTERNAL_ACQUISITION',
        'AUTHORIZATION_CONTEXT_INSERT',
        'COMMAND_INSERT',
        'PAYLOAD_INSERT',
        'AUDIT_INSERT',
        'RESULT_CONSTRUCTION',
        'UNKNOWN_INTERNAL'
      ) THEN v_failure_phase
      ELSE 'UNKNOWN_INTERNAL'
    END
  );
END $facade$;

ALTER FUNCTION public.acquire_atomic_order_command_result_v1(
  uuid, uuid, uuid, text, text, text, text, timestamp with time zone
) OWNER TO afex_function_owner;
REVOKE ALL ON FUNCTION public.acquire_atomic_order_command_result_v1(
  uuid, uuid, uuid, text, text, text, text, timestamp with time zone
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_atomic_order_command_result_v1(
  uuid, uuid, uuid, text, text, text, text, timestamp with time zone
) TO service_role;

RESET ROLE;
REVOKE afex_function_owner FROM postgres GRANTED BY postgres;

DO $post_install$
DECLARE
  function_oid oid := 'public.acquire_atomic_order_command_result_v1(uuid,uuid,uuid,text,text,text,text,timestamp with time zone)'::pg_catalog.regprocedure;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_auth_members AS membership
    JOIN pg_catalog.pg_roles AS granted_role ON granted_role.oid = membership.roleid
    JOIN pg_catalog.pg_roles AS member_role ON member_role.oid = membership.member
    WHERE granted_role.rolname = 'afex_function_owner'
      AND member_role.rolname = 'postgres'
  ) THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'OBSERVABILITY_TEMPORARY_MEMBERSHIP_REMAINS';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS function_state
    JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = function_state.proowner
    WHERE function_state.oid = function_oid
      AND owner_role.rolname = 'afex_function_owner'
      AND function_state.prosecdef
      AND function_state.provolatile = 'v'
      AND function_state.proparallel = 'u'
      AND function_state.proconfig = ARRAY['search_path=pg_catalog']::text[]
  ) THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'OBSERVABILITY_FUNCTION_IDENTITY_INVALID';
  END IF;
  IF NOT pg_catalog.has_function_privilege(
      'service_role', function_oid, 'EXECUTE'
    )
     OR pg_catalog.has_function_privilege('anon', function_oid, 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', function_oid, 'EXECUTE')
     OR EXISTS (
       SELECT 1
       FROM pg_catalog.pg_proc AS function_state,
            LATERAL pg_catalog.aclexplode(function_state.proacl) AS acl_state
       WHERE function_state.oid = function_oid
         AND acl_state.grantee = 0
         AND acl_state.privilege_type = 'EXECUTE'
     ) THEN
    RAISE EXCEPTION USING errcode = '42501', message = 'OBSERVABILITY_FUNCTION_ACL_INVALID';
  END IF;
END $post_install$;

COMMIT;
