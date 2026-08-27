/*
AFEX POS Offline pre-PIN provisioning v2 — read-only Production preflight.
REVIEWED FOR MANUAL EXECUTION ONLY. This file performs no writes and ends in ROLLBACK.
Run as the bounded postgres installer before 01-ADD-PRE-PIN-PROVISIONING-V2.sql.
*/
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '30s';

SELECT pg_catalog.jsonb_build_object(
  'decision', CASE WHEN
    CURRENT_USER = 'postgres'
    AND SESSION_USER = 'postgres'
    AND pg_catalog.current_database() = 'postgres'
    AND pg_catalog.current_setting('server_version_num') = '170006'
    AND pg_catalog.to_regrole('afex_offline_authority_owner') IS NOT NULL
    AND pg_catalog.to_regrole('afex_function_owner') IS NOT NULL
    AND pg_catalog.to_regrole('afex_offline_provisioning_runtime') IS NOT NULL
    AND pg_catalog.to_regrole('service_role') IS NOT NULL
    AND pg_catalog.to_regclass('afex_offline_authority.offline_devices') IS NOT NULL
    AND pg_catalog.to_regclass('afex_offline_authority.offline_employee_authorities') IS NOT NULL
    AND pg_catalog.to_regclass('afex_offline_authority.offline_key_envelopes') IS NOT NULL
    AND pg_catalog.to_regclass('afex_offline_authority.branch_inventory_snapshot_headers') IS NOT NULL
    AND pg_catalog.to_regprocedure('afex_offline_authority.register_offline_device_v1(uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,text)') IS NOT NULL
    AND pg_catalog.to_regprocedure('afex_offline_authority.activate_offline_device_v1(uuid,uuid,uuid,uuid,uuid,bigint,text)') IS NOT NULL
    AND pg_catalog.to_regprocedure('afex_offline_authority.publish_branch_inventory_snapshot_v1(uuid,uuid,uuid,uuid,text,timestamp with time zone,jsonb)') IS NOT NULL
    AND pg_catalog.to_regprocedure('afex_offline_authority.afex_current_auth_session_matches_v1(uuid,uuid)') IS NOT NULL
    AND pg_catalog.to_regprocedure('public.afex_offline_server_acquire_order_create_v1(uuid,uuid,uuid,text,text,integer,uuid,text,uuid,uuid,uuid,uuid,uuid,bigint,bigint,bigint,uuid,bigint,text,uuid,text,text,jsonb,jsonb,jsonb,text,jsonb,text,text,text,timestamp with time zone,timestamp with time zone,text)') IS NOT NULL
    AND pg_catalog.to_regprocedure('public.afex_offline_server_pre_pin_provision_device_v2(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,uuid,text,text,text,text,text,text)') IS NULL
    AND pg_catalog.to_regprocedure('public.afex_offline_server_pre_pin_employee_roster_v2(uuid,uuid,uuid,uuid,uuid)') IS NULL
    AND pg_catalog.to_regprocedure('public.afex_offline_server_pre_pin_publish_inventory_v2(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamp with time zone,jsonb)') IS NULL
    AND pg_catalog.to_regprocedure('public.afex_offline_server_pre_pin_bootstrap_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,uuid,text,text)') IS NULL
  THEN 'AFEX_PRE_PIN_V2_PREFLIGHT_PASS'
  ELSE 'AFEX_PRE_PIN_V2_PREFLIGHT_FAIL'
  END,
  'database', pg_catalog.current_database(),
  'serverVersionNum', pg_catalog.current_setting('server_version_num'),
  'currentUser', CURRENT_USER,
  'sessionUser', SESSION_USER,
  'existingV1OrderAcquisitionPreserved',
    pg_catalog.to_regprocedure('public.afex_offline_server_acquire_order_create_v1(uuid,uuid,uuid,text,text,integer,uuid,text,uuid,uuid,uuid,uuid,uuid,bigint,bigint,bigint,uuid,bigint,text,uuid,text,text,jsonb,jsonb,jsonb,text,jsonb,text,text,text,timestamp with time zone,timestamp with time zone,text)') IS NOT NULL,
  'newV2ContractsAbsent',
    pg_catalog.to_regprocedure('public.afex_offline_server_pre_pin_provision_device_v2(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,uuid,text,text,text,text,text,text)') IS NULL
);

ROLLBACK;
