/*
AFEX W1 multi-device onboarding emergency deactivation.
REVIEW ONLY. CODEX MUST NOT EXECUTE.

Disposition: revoke service_role entry to the four v3 public facades. Keep all
data, private functions, events and indexes. Never recreate the singleton index,
because more than one active device can validly exist after W1 activation.
*/
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $afex$
BEGIN
  IF CURRENT_USER<>'postgres' OR SESSION_USER<>'postgres'
     OR pg_catalog.current_setting('server_version_num')<>'170006'
     OR pg_catalog.to_regprocedure('public.afex_offline_server_pre_pin_provision_device_v3(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,uuid,text,text,text,text,text)') IS NULL
     OR pg_catalog.to_regprocedure('public.afex_offline_server_pre_pin_employee_roster_v3(uuid,uuid,uuid,uuid,uuid)') IS NULL
     OR pg_catalog.to_regprocedure('public.afex_offline_server_pre_pin_publish_inventory_v3(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamp with time zone,jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('public.afex_offline_server_pre_pin_bootstrap_v3(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,uuid,text,text)') IS NULL
  THEN
    RAISE EXCEPTION 'AFEX_MULTI_DEVICE_W1_DEACTIVATION_PREFLIGHT_FAILED';
  END IF;
END
$afex$;

SELECT pg_catalog.set_config('afex.w1.deactivation_memberships_before',(
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'role',g.rolname,'member',mbr.rolname,'grantor',gr.rolname,
    'admin',m.admin_option,'inherit',m.inherit_option,'set',m.set_option)
    ORDER BY g.rolname,mbr.rolname,gr.rolname),'[]'::jsonb)::text
  FROM pg_catalog.pg_auth_members AS m
  JOIN pg_catalog.pg_roles AS g ON g.oid=m.roleid
  JOIN pg_catalog.pg_roles AS mbr ON mbr.oid=m.member
  JOIN pg_catalog.pg_roles AS gr ON gr.oid=m.grantor
  WHERE g.rolname='afex_function_owner' OR mbr.rolname='afex_function_owner'
),true);
SELECT pg_catalog.set_config('afex.w1.deactivation_data_before',(
  SELECT pg_catalog.jsonb_build_object(
    'devices',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(d) ORDER BY d.device_id)::text
        FROM afex_offline_authority.offline_devices d),'[]'),'UTF8')),'hex'),
    'envelopes',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(k) ORDER BY k.key_envelope_id,k.key_envelope_version)::text
        FROM afex_offline_authority.offline_key_envelopes k),'[]'),'UTF8')),'hex'),
    'bootstraps',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(b) ORDER BY b.bootstrap_id)::text
        FROM afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2 b),'[]'),'UTF8')),'hex')
  )::text
),true);

SELECT pg_catalog.set_config('afex.w1.deactivation_temp_membership','false',true);
DO $afex$
BEGIN
  IF NOT pg_catalog.pg_has_role('postgres','afex_function_owner','SET') THEN
    EXECUTE 'GRANT afex_function_owner TO postgres '
      'WITH ADMIN FALSE, INHERIT FALSE, SET TRUE GRANTED BY CURRENT_USER';
    PERFORM pg_catalog.set_config(
      'afex.w1.deactivation_temp_membership','true',true);
  END IF;
  IF NOT pg_catalog.pg_has_role('postgres','afex_function_owner','SET') THEN
    RAISE EXCEPTION 'AFEX_MULTI_DEVICE_W1_DEACTIVATION_OWNER_SET_UNAVAILABLE';
  END IF;
END
$afex$;

SET LOCAL ROLE afex_function_owner;
REVOKE EXECUTE ON FUNCTION
  public.afex_offline_server_pre_pin_provision_device_v3(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,uuid,text,text,text,text,text),
  public.afex_offline_server_pre_pin_employee_roster_v3(uuid,uuid,uuid,uuid,uuid),
  public.afex_offline_server_pre_pin_publish_inventory_v3(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamptz,jsonb),
  public.afex_offline_server_pre_pin_bootstrap_v3(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,uuid,text,text)
FROM service_role;
RESET ROLE;

DO $afex$
BEGIN
  IF pg_catalog.current_setting(
    'afex.w1.deactivation_temp_membership')='true' THEN
    EXECUTE 'REVOKE afex_function_owner FROM postgres '
      'GRANTED BY CURRENT_USER RESTRICT';
  END IF;
END
$afex$;

DO $afex$
DECLARE memberships_ok boolean; data_ok boolean; facades_closed boolean;
BEGIN
  SELECT pg_catalog.current_setting(
    'afex.w1.deactivation_memberships_before')::jsonb=(
    SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'role',g.rolname,'member',mbr.rolname,'grantor',gr.rolname,
      'admin',m.admin_option,'inherit',m.inherit_option,'set',m.set_option)
      ORDER BY g.rolname,mbr.rolname,gr.rolname),'[]'::jsonb)
    FROM pg_catalog.pg_auth_members AS m
    JOIN pg_catalog.pg_roles AS g ON g.oid=m.roleid
    JOIN pg_catalog.pg_roles AS mbr ON mbr.oid=m.member
    JOIN pg_catalog.pg_roles AS gr ON gr.oid=m.grantor
    WHERE g.rolname='afex_function_owner' OR mbr.rolname='afex_function_owner'
  ) INTO memberships_ok;

  SELECT pg_catalog.current_setting('afex.w1.deactivation_data_before')::jsonb=
    pg_catalog.jsonb_build_object(
      'devices',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
        COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(d) ORDER BY d.device_id)::text
          FROM afex_offline_authority.offline_devices d),'[]'),'UTF8')),'hex'),
      'envelopes',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
        COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(k) ORDER BY k.key_envelope_id,k.key_envelope_version)::text
          FROM afex_offline_authority.offline_key_envelopes k),'[]'),'UTF8')),'hex'),
      'bootstraps',pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
        COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(b) ORDER BY b.bootstrap_id)::text
          FROM afex_offline_authority.offline_pre_pin_bootstrap_authorities_v2 b),'[]'),'UTF8')),'hex')
    ) INTO data_ok;

  SELECT NOT EXISTS (SELECT 1 FROM (VALUES
    ('public.afex_offline_server_pre_pin_provision_device_v3(uuid,uuid,uuid,uuid,uuid,uuid,text,jsonb,jsonb,uuid,text,text,text,text,text)'),
    ('public.afex_offline_server_pre_pin_employee_roster_v3(uuid,uuid,uuid,uuid,uuid)'),
    ('public.afex_offline_server_pre_pin_publish_inventory_v3(uuid,uuid,uuid,uuid,uuid,uuid,text,timestamp with time zone,jsonb)'),
    ('public.afex_offline_server_pre_pin_bootstrap_v3(uuid,uuid,uuid,uuid,uuid,uuid,uuid,bigint,bigint,uuid,text,text)')
  ) f(identity) WHERE pg_catalog.has_function_privilege(
    'service_role',pg_catalog.to_regprocedure(f.identity),'EXECUTE'))
  INTO facades_closed;

  IF NOT COALESCE(memberships_ok,false) OR NOT COALESCE(data_ok,false)
     OR NOT COALESCE(facades_closed,false)
     OR pg_catalog.to_regclass(
       'afex_offline_authority.offline_devices_one_active_branch_uidx') IS NOT NULL
  THEN
    RAISE EXCEPTION 'AFEX_MULTI_DEVICE_W1_DEACTIVATION_ATTESTATION_FAILED';
  END IF;
END
$afex$;

SELECT pg_catalog.jsonb_build_object(
  'decision','AFEX_MULTI_DEVICE_W1_DEACTIVATED',
  'serviceFacadeExecuteRevoked',true,
  'dataDeleted',false,'deviceStatusChanged',false,
  'singletonIndexRestored',false,
  'recovery','REVIEW_AND_REGRANT_V3_FACADES_THEN_ENABLE_PREVIEW_FLAG');
COMMIT;
