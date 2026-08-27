/*
AFEX POS Offline pre-PIN provisioning v2 — emergency deactivation.
REVIEW-ONLY. Retains tables, immutable evidence and functions. It only revokes
the four server-facade EXECUTE grants; no row is deleted or mutated.
*/
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $afex$ BEGIN
  IF CURRENT_USER<>'postgres' OR SESSION_USER<>'postgres'
     OR pg_catalog.to_regprocedure('public.afex_offline_server_pre_pin_provision_device_v2(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,uuid,text,text,text,text,text,text)') IS NULL
     OR pg_catalog.to_regprocedure('public.afex_offline_server_pre_pin_employee_roster_v2(uuid,uuid,uuid,uuid,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.afex_offline_server_pre_pin_publish_inventory_v2(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamp with time zone,jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('public.afex_offline_server_pre_pin_bootstrap_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'AFEX_PRE_PIN_V2_DEACTIVATION_PRECONDITION_FAILED';
  END IF;
END $afex$;

REVOKE EXECUTE ON FUNCTION
  public.afex_offline_server_pre_pin_provision_device_v2(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,uuid,text,text,text,text,text,text),
  public.afex_offline_server_pre_pin_employee_roster_v2(uuid,uuid,uuid,uuid,uuid),
  public.afex_offline_server_pre_pin_publish_inventory_v2(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,jsonb),
  public.afex_offline_server_pre_pin_bootstrap_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,uuid,text,text)
FROM service_role;

DO $afex$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid=p.pronamespace
    WHERE n.nspname='public'
      AND p.proname IN (
        'afex_offline_server_pre_pin_provision_device_v2',
        'afex_offline_server_pre_pin_employee_roster_v2',
        'afex_offline_server_pre_pin_publish_inventory_v2',
        'afex_offline_server_pre_pin_bootstrap_v2')
      AND pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')
  ) OR pg_catalog.to_regclass(
    'afex_offline_authority.offline_pre_pin_bootstrap_events_v2') IS NULL THEN
    RAISE EXCEPTION 'AFEX_PRE_PIN_V2_DEACTIVATION_ATTESTATION_FAILED';
  END IF;
  RAISE NOTICE 'AFEX_PRE_PIN_V2_DEACTIVATED: evidence retained; order acquisition unchanged';
END $afex$;

COMMIT;
