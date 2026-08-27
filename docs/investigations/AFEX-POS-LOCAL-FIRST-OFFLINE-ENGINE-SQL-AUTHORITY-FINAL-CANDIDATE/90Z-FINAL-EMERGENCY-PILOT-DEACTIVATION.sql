/*
classification: NOT_EXECUTED_EXACT_EMERGENCY_DEACTIVATION
purpose: Revoke trusted-server EXECUTE only; no Foundation object is dropped.
*/
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

DO $afex$ BEGIN
  IF CURRENT_USER<>'postgres' OR SESSION_USER<>'postgres' THEN
    RAISE EXCEPTION 'AFEX_FINAL_PILOT_DEACTIVATION_PRINCIPAL_MISMATCH';
  END IF;
END $afex$;

GRANT afex_function_owner TO postgres
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE
  GRANTED BY CURRENT_USER;
SET LOCAL ROLE afex_function_owner;
REVOKE EXECUTE ON FUNCTION
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
FROM service_role;
RESET ROLE;
REVOKE afex_function_owner FROM postgres GRANTED BY CURRENT_USER;

DO $afex$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(
      pg_catalog.coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))
    ) acl
    JOIN pg_catalog.pg_roles grantee ON grantee.oid=acl.grantee
    WHERE n.nspname='public' AND p.proname LIKE 'afex_offline_server_%_v1'
      AND grantee.rolname='service_role' AND acl.privilege_type='EXECUTE'
  ) THEN
    RAISE EXCEPTION 'AFEX_FINAL_PILOT_DEACTIVATION_ATTESTATION_FAILED';
  END IF;
END
$afex$;
COMMIT;
