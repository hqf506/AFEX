/*
AFEX POS Offline pre-PIN provisioning v2 — owner-aware emergency deactivation.
REVIEW-ONLY. Retains tables, immutable evidence and functions. It revokes only
the four service-role facade grants while executing as their recorded owner.
*/
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $afex$
DECLARE membership_snapshot jsonb; acquisition_snapshot jsonb;
BEGIN
  IF CURRENT_USER<>'postgres' OR SESSION_USER<>'postgres'
     OR pg_catalog.has_schema_privilege('afex_function_owner','public','CREATE')
     OR pg_catalog.to_regprocedure('public.afex_offline_server_pre_pin_provision_device_v2(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,uuid,text,text,text,text,text)') IS NULL
     OR pg_catalog.to_regprocedure('public.afex_offline_server_pre_pin_employee_roster_v2(uuid,uuid,uuid,uuid,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.afex_offline_server_pre_pin_publish_inventory_v2(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamp with time zone,jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('public.afex_offline_server_pre_pin_bootstrap_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,uuid,text,text)') IS NULL
  THEN RAISE EXCEPTION 'AFEX_PRE_PIN_V2_DEACTIVATION_PRECONDITION_FAILED'; END IF;
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'role',r.rolname,'grantor',pg_catalog.pg_get_userbyid(m.grantor),
    'admin',m.admin_option,'inherit',m.inherit_option,'set',m.set_option)
    ORDER BY r.rolname,pg_catalog.pg_get_userbyid(m.grantor)),'[]'::jsonb)
  INTO membership_snapshot
  FROM pg_catalog.pg_auth_members AS m
  JOIN pg_catalog.pg_roles AS r ON r.oid=m.roleid
  JOIN pg_catalog.pg_roles AS u ON u.oid=m.member
  WHERE u.rolname='postgres' AND r.rolname='afex_function_owner';
  SELECT pg_catalog.jsonb_build_object(
    'oid',p.oid,'owner',pg_catalog.pg_get_userbyid(p.proowner),
    'securityDefiner',p.prosecdef,'config',p.proconfig,'acl',p.proacl::text,
    'definitionMd5',pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)))
  INTO STRICT acquisition_snapshot FROM pg_catalog.pg_proc AS p
  WHERE p.oid=pg_catalog.to_regprocedure(
    'public.afex_offline_server_acquire_order_create_v1(uuid,uuid,uuid,text,text,integer,uuid,text,uuid,uuid,uuid,uuid,uuid,bigint,bigint,bigint,uuid,bigint,text,uuid,text,text,jsonb,jsonb,jsonb,text,jsonb,text,text,text,timestamp with time zone,timestamp with time zone,text)');
  PERFORM pg_catalog.set_config('afex.pre_pin_v2_deactivate_membership',membership_snapshot::text,true);
  PERFORM pg_catalog.set_config('afex.pre_pin_v2_deactivate_acquisition',acquisition_snapshot::text,true);
END
$afex$;

GRANT afex_function_owner TO postgres
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE GRANTED BY CURRENT_USER;
DO $afex$ BEGIN
  IF NOT pg_catalog.pg_has_role('postgres','afex_function_owner','SET') THEN
    RAISE EXCEPTION 'AFEX_PRE_PIN_V2_DEACTIVATION_OWNER_SET_FAILED';
  END IF;
END $afex$;
SET LOCAL ROLE afex_function_owner;

REVOKE EXECUTE ON FUNCTION
  public.afex_offline_server_pre_pin_provision_device_v2(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,uuid,text,text,text,text,text),
  public.afex_offline_server_pre_pin_employee_roster_v2(uuid,uuid,uuid,uuid,uuid),
  public.afex_offline_server_pre_pin_publish_inventory_v2(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,jsonb),
  public.afex_offline_server_pre_pin_bootstrap_v2(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,uuid,text,text)
FROM service_role;

RESET ROLE;
REVOKE afex_function_owner FROM postgres GRANTED BY CURRENT_USER;

DO $afex$
DECLARE current_membership jsonb; current_acquisition jsonb;
BEGIN
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'role',r.rolname,'grantor',pg_catalog.pg_get_userbyid(m.grantor),
    'admin',m.admin_option,'inherit',m.inherit_option,'set',m.set_option)
    ORDER BY r.rolname,pg_catalog.pg_get_userbyid(m.grantor)),'[]'::jsonb)
  INTO current_membership
  FROM pg_catalog.pg_auth_members AS m
  JOIN pg_catalog.pg_roles AS r ON r.oid=m.roleid
  JOIN pg_catalog.pg_roles AS u ON u.oid=m.member
  WHERE u.rolname='postgres' AND r.rolname='afex_function_owner';
  SELECT pg_catalog.jsonb_build_object(
    'oid',p.oid,'owner',pg_catalog.pg_get_userbyid(p.proowner),
    'securityDefiner',p.prosecdef,'config',p.proconfig,'acl',p.proacl::text,
    'definitionMd5',pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid)))
  INTO STRICT current_acquisition FROM pg_catalog.pg_proc AS p
  WHERE p.oid=pg_catalog.to_regprocedure(
    'public.afex_offline_server_acquire_order_create_v1(uuid,uuid,uuid,text,text,integer,uuid,text,uuid,uuid,uuid,uuid,uuid,bigint,bigint,bigint,uuid,bigint,text,uuid,text,text,jsonb,jsonb,jsonb,text,jsonb,text,text,text,timestamp with time zone,timestamp with time zone,text)');
  IF CURRENT_USER<>'postgres' OR SESSION_USER<>'postgres'
     OR pg_catalog.has_schema_privilege('afex_function_owner','public','CREATE')
     OR current_membership<>pg_catalog.current_setting('afex.pre_pin_v2_deactivate_membership')::jsonb
     OR current_acquisition<>pg_catalog.current_setting('afex.pre_pin_v2_deactivate_acquisition')::jsonb
     OR EXISTS (
       SELECT 1 FROM pg_catalog.pg_proc AS p
       JOIN pg_catalog.pg_namespace AS n ON n.oid=p.pronamespace
       WHERE n.nspname='public'
         AND p.proname IN ('afex_offline_server_pre_pin_provision_device_v2',
           'afex_offline_server_pre_pin_employee_roster_v2',
           'afex_offline_server_pre_pin_publish_inventory_v2',
           'afex_offline_server_pre_pin_bootstrap_v2')
         AND (pg_catalog.pg_get_userbyid(p.proowner)<>'afex_function_owner'
           OR pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE')))
     OR pg_catalog.to_regclass('afex_offline_authority.offline_pre_pin_bootstrap_events_v2') IS NULL
  THEN RAISE EXCEPTION 'AFEX_PRE_PIN_V2_DEACTIVATION_ATTESTATION_FAILED'; END IF;
  RAISE NOTICE 'AFEX_PRE_PIN_V2_DEACTIVATED: owner-aware facade revocation; evidence retained; order acquisition unchanged';
END
$afex$;

COMMIT;
