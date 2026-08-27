/*
classification: NOT_EXECUTED_REQUIRES_FINAL_HUMAN_APPROVAL
scope: order.create Pilot trusted-server transport only
This file is separate from the 22-wave Foundation. It grants no table access,
no browser authority, and no provider/external-effect authority.
*/
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $afex$
BEGIN
  IF CURRENT_USER<>'postgres' OR SESSION_USER<>'postgres'
     OR pg_catalog.current_database()<>'postgres'
     OR pg_catalog.current_setting('server_version_num')<>'170006'
     OR pg_catalog.to_regprocedure(
       'afex_offline_authority.acquire_offline_order_create_v2(uuid,uuid,uuid,text,text,integer,uuid,text,uuid,uuid,uuid,uuid,uuid,bigint,bigint,bigint,uuid,bigint,text,uuid,text,text,jsonb,jsonb,jsonb,text,jsonb,text,text,text,timestamp with time zone,timestamp with time zone,text)'
     ) IS NULL
     OR pg_catalog.to_regprocedure(
       'afex_offline_authority.lookup_offline_order_create_receipts_v2(uuid,uuid,uuid,jsonb)'
     ) IS NULL THEN
    RAISE EXCEPTION 'AFEX_FINAL_PILOT_ACTIVATION_PREFLIGHT_FAILED';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE 'afex_offline_server_%_v1'
  ) THEN
    RAISE EXCEPTION 'AFEX_FINAL_PILOT_ACTIVATION_FACADE_ALREADY_EXISTS';
  END IF;
END
$afex$;

GRANT afex_offline_authority_owner TO postgres
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE
  GRANTED BY CURRENT_USER;
SET LOCAL ROLE afex_offline_authority_owner;
GRANT EXECUTE ON FUNCTION
  afex_offline_authority.register_offline_device_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,text),
  afex_offline_authority.activate_offline_device_v1(uuid,uuid,uuid,uuid,uuid,bigint,text),
  afex_offline_authority.enroll_offline_employee_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,bytea,bytea,text,text),
  afex_offline_authority.replace_offline_employee_pin_verifier_v1(uuid,uuid,uuid,uuid,uuid,uuid,bigint,bytea,bytea,text,text),
  afex_offline_authority.publish_branch_inventory_snapshot_v1(uuid,uuid,uuid,uuid,text,timestamptz,jsonb),
  afex_offline_authority.publish_offline_account_bootstrap_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,uuid,text,text),
  afex_offline_authority.explicit_logout_offline_account_v1(uuid,uuid,uuid,uuid,uuid,uuid,text),
  afex_offline_authority.read_current_offline_bootstrap_authority_v1(uuid,uuid,uuid,uuid)
TO afex_function_owner;
RESET ROLE;
REVOKE afex_offline_authority_owner FROM postgres GRANTED BY CURRENT_USER;

GRANT CREATE ON SCHEMA public TO afex_function_owner;
GRANT afex_function_owner TO postgres
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE
  GRANTED BY CURRENT_USER;
SET LOCAL ROLE afex_function_owner;

CREATE FUNCTION public.afex_offline_server_context_matches_v1(
  p_authenticated_subject_id uuid,p_authenticated_session_id uuid,
  p_pos_actor_session_id uuid,p_tenant_id uuid,p_branch_id uuid,
  p_actual_pos_employee_id uuid
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
  SELECT afex_offline_authority.afex_current_auth_session_matches_v1(
    p_authenticated_subject_id,p_authenticated_session_id
  ) AND EXISTS (
    SELECT 1 FROM afex_pos_authority.actor_sessions s
    WHERE s.session_id=p_pos_actor_session_id
      AND s.authenticated_subject_id=p_authenticated_subject_id
      AND s.authenticated_session_id=p_authenticated_session_id
      AND s.tenant_id=p_tenant_id AND s.branch_id=p_branch_id
      AND (p_actual_pos_employee_id IS NULL OR s.actor_id=p_actual_pos_employee_id)
      AND s.revoked_at IS NULL
      AND s.expires_at>pg_catalog.transaction_timestamp()
  )
$fn$;

CREATE FUNCTION public.afex_offline_server_register_device_v1(
  p_operation_id uuid,p_primary_authenticated_subject_id uuid,
  p_authenticated_session_id uuid,p_pos_actor_session_id uuid,
  p_tenant_id uuid,p_branch_id uuid,p_device_id uuid,p_mode text,
  p_proof_public_key_jwk jsonb,p_wrap_public_key_jwk jsonb,p_evidence_sha256 text
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog
AS $fn$ BEGIN
  IF NOT public.afex_offline_server_context_matches_v1(
    p_primary_authenticated_subject_id,p_authenticated_session_id,
    p_pos_actor_session_id,p_tenant_id,p_branch_id,NULL
  ) THEN RAISE EXCEPTION 'AFEX_OFFLINE_SERVER_CONTEXT_REJECTED'; END IF;
  RETURN afex_offline_authority.register_offline_device_v1(
    p_operation_id,p_primary_authenticated_subject_id,p_tenant_id,p_branch_id,
    p_device_id,p_mode,p_proof_public_key_jwk,p_wrap_public_key_jwk,p_evidence_sha256);
END $fn$;

CREATE FUNCTION public.afex_offline_server_activate_device_v1(
  p_operation_id uuid,p_primary_authenticated_subject_id uuid,
  p_authenticated_session_id uuid,p_pos_actor_session_id uuid,
  p_tenant_id uuid,p_branch_id uuid,p_device_id uuid,
  p_expected_device_generation bigint,p_evidence_sha256 text
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog
AS $fn$ BEGIN
  IF NOT public.afex_offline_server_context_matches_v1(
    p_primary_authenticated_subject_id,p_authenticated_session_id,
    p_pos_actor_session_id,p_tenant_id,p_branch_id,NULL
  ) THEN RAISE EXCEPTION 'AFEX_OFFLINE_SERVER_CONTEXT_REJECTED'; END IF;
  RETURN afex_offline_authority.activate_offline_device_v1(
    p_operation_id,p_primary_authenticated_subject_id,p_tenant_id,p_branch_id,
    p_device_id,p_expected_device_generation,p_evidence_sha256);
END $fn$;

CREATE FUNCTION public.afex_offline_server_enroll_employee_v1(
  p_operation_id uuid,p_primary_authenticated_subject_id uuid,
  p_authenticated_session_id uuid,p_pos_actor_session_id uuid,
  p_tenant_id uuid,p_branch_id uuid,p_device_id uuid,p_actual_pos_employee_id uuid,
  p_key_envelope_id uuid,p_key_envelope_version bigint,p_namespace_generation bigint,
  p_pin_verifier_salt bytea,p_pin_verifier_bytes bytea,
  p_package_sha256 text,p_evidence_sha256 text
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog
AS $fn$ BEGIN
  IF NOT public.afex_offline_server_context_matches_v1(
    p_primary_authenticated_subject_id,p_authenticated_session_id,
    p_pos_actor_session_id,p_tenant_id,p_branch_id,p_actual_pos_employee_id
  ) THEN RAISE EXCEPTION 'AFEX_OFFLINE_SERVER_CONTEXT_REJECTED'; END IF;
  RETURN afex_offline_authority.enroll_offline_employee_v1(
    p_operation_id,p_primary_authenticated_subject_id,p_tenant_id,p_branch_id,
    p_device_id,p_actual_pos_employee_id,p_key_envelope_id,p_key_envelope_version,
    p_namespace_generation,p_pin_verifier_salt,p_pin_verifier_bytes,
    p_package_sha256,p_evidence_sha256);
END $fn$;

CREATE FUNCTION public.afex_offline_server_replace_employee_pin_v1(
  p_operation_id uuid,p_primary_authenticated_subject_id uuid,
  p_authenticated_session_id uuid,p_pos_actor_session_id uuid,
  p_tenant_id uuid,p_branch_id uuid,p_device_id uuid,p_actual_pos_employee_id uuid,
  p_expected_enrollment_generation bigint,p_pin_verifier_salt bytea,
  p_pin_verifier_bytes bytea,p_package_sha256 text,p_evidence_sha256 text
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog
AS $fn$ BEGIN
  IF NOT public.afex_offline_server_context_matches_v1(
    p_primary_authenticated_subject_id,p_authenticated_session_id,
    p_pos_actor_session_id,p_tenant_id,p_branch_id,p_actual_pos_employee_id
  ) THEN RAISE EXCEPTION 'AFEX_OFFLINE_SERVER_CONTEXT_REJECTED'; END IF;
  RETURN afex_offline_authority.replace_offline_employee_pin_verifier_v1(
    p_operation_id,p_primary_authenticated_subject_id,p_tenant_id,p_branch_id,
    p_device_id,p_actual_pos_employee_id,p_expected_enrollment_generation,
    p_pin_verifier_salt,p_pin_verifier_bytes,p_package_sha256,p_evidence_sha256);
END $fn$;

CREATE FUNCTION public.afex_offline_server_publish_inventory_v1(
  p_snapshot_id uuid,p_primary_authenticated_subject_id uuid,
  p_authenticated_session_id uuid,p_pos_actor_session_id uuid,
  p_tenant_id uuid,p_branch_id uuid,p_frontier_version text,
  p_confirmed_at timestamptz,p_items jsonb
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog
AS $fn$ BEGIN
  IF NOT public.afex_offline_server_context_matches_v1(
    p_primary_authenticated_subject_id,p_authenticated_session_id,
    p_pos_actor_session_id,p_tenant_id,p_branch_id,NULL
  ) THEN RAISE EXCEPTION 'AFEX_OFFLINE_SERVER_CONTEXT_REJECTED'; END IF;
  RETURN afex_offline_authority.publish_branch_inventory_snapshot_v1(
    p_snapshot_id,p_primary_authenticated_subject_id,p_tenant_id,p_branch_id,
    p_frontier_version,p_confirmed_at,p_items);
END $fn$;

CREATE FUNCTION public.afex_offline_server_read_inventory_v1(
  p_sync_authenticated_subject_id uuid,p_sync_authenticated_session_id uuid,
  p_sync_pos_actor_session_id uuid,p_claim jsonb,p_catalog_item_ids uuid[]
)
RETURNS jsonb LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
  SELECT afex_offline_authority.read_branch_inventory_frontier_v2(
    p_sync_authenticated_subject_id,p_sync_authenticated_session_id,
    p_sync_pos_actor_session_id,p_claim,p_catalog_item_ids)
$fn$;

CREATE FUNCTION public.afex_offline_server_bootstrap_v1(
  p_operation_id uuid,p_primary_authenticated_subject_id uuid,
  p_authenticated_session_id uuid,p_pos_actor_session_id uuid,
  p_tenant_id uuid,p_branch_id uuid,p_device_id uuid,p_key_envelope_id uuid,
  p_key_envelope_version bigint,p_namespace_generation bigint,
  p_inventory_snapshot_id uuid,p_package_sha256 text,p_evidence_sha256 text
)
RETURNS jsonb LANGUAGE sql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
  SELECT afex_offline_authority.publish_offline_account_bootstrap_v1(
    p_operation_id,p_primary_authenticated_subject_id,p_authenticated_session_id,
    p_pos_actor_session_id,p_tenant_id,p_branch_id,p_device_id,p_key_envelope_id,
    p_key_envelope_version,p_namespace_generation,p_inventory_snapshot_id,
    p_package_sha256,p_evidence_sha256)
$fn$;

CREATE FUNCTION public.afex_offline_server_resolve_order_create_batch_v1(
  p_sync_authenticated_subject_id uuid,p_sync_authenticated_session_id uuid,
  p_sync_pos_actor_session_id uuid,p_claims jsonb
)
RETURNS jsonb LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
  SELECT afex_offline_authority.resolve_offline_order_create_authority_batch_v2(
    p_sync_authenticated_subject_id,p_sync_authenticated_session_id,
    p_sync_pos_actor_session_id,p_claims)
$fn$;

CREATE FUNCTION public.afex_offline_server_acquire_order_create_v1(
  p_sync_authenticated_subject_id uuid,p_sync_authenticated_session_id uuid,
  p_sync_pos_actor_session_id uuid,p_command_contract_version text,
  p_command_type text,p_schema_version integer,p_local_command_id uuid,
  p_idempotency_key text,p_primary_authenticated_user_id uuid,
  p_actual_pos_employee_id uuid,p_tenant_id uuid,p_branch_id uuid,p_device_id uuid,
  p_device_generation bigint,p_employee_enrollment_generation bigint,
  p_command_generation bigint,p_key_envelope_id uuid,p_key_envelope_version bigint,
  p_aggregate_type text,p_aggregate_id uuid,p_local_aggregate_reference text,
  p_payload_canonical_hash text,p_payment_attestation jsonb,
  p_inventory_frontier_reference jsonb,p_origin_authority_reference jsonb,
  p_authority_binding_canonical_hash text,p_offline_canonical_payload jsonb,
  p_core_canonical_payload text,p_core_fingerprint_projection text,
  p_correlation_reference text,p_retain_until timestamptz,
  p_local_created_at timestamptz,p_client_application_version text
)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
  SELECT afex_offline_authority.acquire_offline_order_create_v2(
    p_sync_authenticated_subject_id,p_sync_authenticated_session_id,
    p_sync_pos_actor_session_id,p_command_contract_version,p_command_type,
    p_schema_version,p_local_command_id,p_idempotency_key,
    p_primary_authenticated_user_id,p_actual_pos_employee_id,p_tenant_id,p_branch_id,
    p_device_id,p_device_generation,p_employee_enrollment_generation,
    p_command_generation,p_key_envelope_id,p_key_envelope_version,p_aggregate_type,
    p_aggregate_id,p_local_aggregate_reference,p_payload_canonical_hash,
    p_payment_attestation,p_inventory_frontier_reference,p_origin_authority_reference,
    p_authority_binding_canonical_hash,p_offline_canonical_payload,
    p_core_canonical_payload,p_core_fingerprint_projection,p_correlation_reference,
    p_retain_until,p_local_created_at,p_client_application_version)
$fn$;

CREATE FUNCTION public.afex_offline_server_lookup_receipts_v1(
  p_sync_authenticated_subject_id uuid,p_sync_authenticated_session_id uuid,
  p_sync_pos_actor_session_id uuid,p_claims jsonb
)
RETURNS jsonb LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path=pg_catalog
AS $fn$
  SELECT afex_offline_authority.lookup_offline_order_create_receipts_v2(
    p_sync_authenticated_subject_id,p_sync_authenticated_session_id,
    p_sync_pos_actor_session_id,p_claims)
$fn$;

CREATE FUNCTION public.afex_offline_server_logout_v1(
  p_operation_id uuid,p_primary_authenticated_subject_id uuid,
  p_authenticated_session_id uuid,p_pos_actor_session_id uuid,
  p_tenant_id uuid,p_branch_id uuid,p_device_id uuid,p_evidence_sha256 text
)
RETURNS jsonb LANGUAGE plpgsql VOLATILE STRICT SECURITY DEFINER SET search_path=pg_catalog
AS $fn$ BEGIN
  IF NOT public.afex_offline_server_context_matches_v1(
    p_primary_authenticated_subject_id,p_authenticated_session_id,
    p_pos_actor_session_id,p_tenant_id,p_branch_id,NULL
  ) THEN RAISE EXCEPTION 'AFEX_OFFLINE_SERVER_CONTEXT_REJECTED'; END IF;
  RETURN afex_offline_authority.explicit_logout_offline_account_v1(
    p_operation_id,p_primary_authenticated_subject_id,p_authenticated_session_id,
    p_tenant_id,p_branch_id,p_device_id,p_evidence_sha256);
END $fn$;

CREATE FUNCTION public.afex_offline_server_recovery_state_v1(
  p_primary_authenticated_subject_id uuid,p_authenticated_session_id uuid,
  p_pos_actor_session_id uuid,p_tenant_id uuid,p_branch_id uuid,p_device_id uuid
)
RETURNS jsonb LANGUAGE plpgsql STABLE STRICT SECURITY DEFINER SET search_path=pg_catalog
AS $fn$ BEGIN
  IF NOT public.afex_offline_server_context_matches_v1(
    p_primary_authenticated_subject_id,p_authenticated_session_id,
    p_pos_actor_session_id,p_tenant_id,p_branch_id,NULL
  ) THEN RAISE EXCEPTION 'AFEX_OFFLINE_SERVER_CONTEXT_REJECTED'; END IF;
  RETURN afex_offline_authority.read_current_offline_bootstrap_authority_v1(
    p_primary_authenticated_subject_id,p_tenant_id,p_branch_id,p_device_id);
END $fn$;

REVOKE ALL ON FUNCTION
  public.afex_offline_server_context_matches_v1(uuid,uuid,uuid,uuid,uuid,uuid),
  public.afex_offline_server_register_device_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,text),
  public.afex_offline_server_activate_device_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,text),
  public.afex_offline_server_enroll_employee_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,bytea,bytea,text,text),
  public.afex_offline_server_replace_employee_pin_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bytea,bytea,text,text),
  public.afex_offline_server_publish_inventory_v1(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,jsonb),
  public.afex_offline_server_read_inventory_v1(uuid,uuid,uuid,jsonb,uuid[]),
  public.afex_offline_server_bootstrap_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,uuid,text,text),
  public.afex_offline_server_resolve_order_create_batch_v1(uuid,uuid,uuid,jsonb),
  public.afex_offline_server_acquire_order_create_v1(uuid,uuid,uuid,text,text,integer,uuid,text,uuid,uuid,uuid,uuid,uuid,bigint,bigint,bigint,uuid,bigint,text,uuid,text,text,jsonb,jsonb,jsonb,text,jsonb,text,text,text,timestamptz,timestamptz,text),
  public.afex_offline_server_lookup_receipts_v1(uuid,uuid,uuid,jsonb),
  public.afex_offline_server_logout_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text),
  public.afex_offline_server_recovery_state_v1(uuid,uuid,uuid,uuid,uuid,uuid)
FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION
  public.afex_offline_server_register_device_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,text),
  public.afex_offline_server_activate_device_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,text),
  public.afex_offline_server_enroll_employee_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,bytea,bytea,text,text),
  public.afex_offline_server_replace_employee_pin_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bytea,bytea,text,text),
  public.afex_offline_server_publish_inventory_v1(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,jsonb),
  public.afex_offline_server_read_inventory_v1(uuid,uuid,uuid,jsonb,uuid[]),
  public.afex_offline_server_bootstrap_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,uuid,text,text),
  public.afex_offline_server_resolve_order_create_batch_v1(uuid,uuid,uuid,jsonb),
  public.afex_offline_server_acquire_order_create_v1(uuid,uuid,uuid,text,text,integer,uuid,text,uuid,uuid,uuid,uuid,uuid,bigint,bigint,bigint,uuid,bigint,text,uuid,text,text,jsonb,jsonb,jsonb,text,jsonb,text,text,text,timestamptz,timestamptz,text),
  public.afex_offline_server_lookup_receipts_v1(uuid,uuid,uuid,jsonb),
  public.afex_offline_server_logout_v1(uuid,uuid,uuid,uuid,uuid,uuid,uuid,text),
  public.afex_offline_server_recovery_state_v1(uuid,uuid,uuid,uuid,uuid,uuid)
TO service_role;

RESET ROLE;
REVOKE afex_function_owner FROM postgres GRANTED BY CURRENT_USER;
REVOKE CREATE ON SCHEMA public FROM afex_function_owner;

DO $afex$
BEGIN
  IF CURRENT_USER<>'postgres' OR SESSION_USER<>'postgres'
     OR pg_catalog.has_schema_privilege('afex_function_owner','public','CREATE')
     OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc p
         JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
         JOIN pg_catalog.pg_roles r ON r.oid=p.proowner
         WHERE n.nspname='public' AND p.proname LIKE 'afex_offline_server_%_v1'
           AND r.rolname='afex_function_owner')<>13
     OR EXISTS (
       SELECT 1 FROM pg_catalog.pg_proc p
       JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
       CROSS JOIN LATERAL pg_catalog.aclexplode(
         pg_catalog.coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))
       ) acl
       WHERE n.nspname='public' AND p.proname LIKE 'afex_offline_server_%_v1'
         AND acl.grantee=0 AND acl.privilege_type='EXECUTE'
     ) THEN
    RAISE EXCEPTION 'AFEX_FINAL_PILOT_ACTIVATION_POST_ATTESTATION_FAILED';
  END IF;
END
$afex$;
COMMIT;
