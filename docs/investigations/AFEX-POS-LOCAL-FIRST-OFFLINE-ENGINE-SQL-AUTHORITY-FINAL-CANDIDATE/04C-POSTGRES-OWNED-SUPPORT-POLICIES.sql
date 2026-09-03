/*
REVIEW-ONLY INACTIVE FORWARD SQL. NOT AUTHORIZED FOR EXECUTION.
Wave 1F: exact postgres-owned public support ACLs and policies. No Core, POS or
Auth-owned object is mutated by this wave.
*/
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $afex$ BEGIN
  IF CURRENT_USER<>'postgres' OR SESSION_USER<>'postgres'
     OR pg_catalog.current_database()<>'postgres'
     OR pg_catalog.current_setting('server_version_num')<>'170006' THEN
    RAISE EXCEPTION 'AFEX_WAVE_01F_INSTALLER_IDENTITY_MISMATCH';
  END IF;
END $afex$;

-- FWD-04C-001
GRANT USAGE ON SCHEMA public TO afex_function_owner,afex_offline_authority_owner;
-- FWD-04C-002
GRANT SELECT(id,is_active) ON public.profiles TO afex_function_owner;
-- FWD-04C-003
GRANT SELECT(id,tenant_id,branch_id,is_active,role)
  ON public.profiles TO afex_offline_authority_owner;
-- FWD-04C-004
GRANT SELECT(id,tenant_id,is_active)
  ON public.branches TO afex_offline_authority_owner;
-- FWD-04C-005
GRANT SELECT(id,tenant_id,branch_id,role,is_active,updated_at)
  ON public.pos_profiles TO afex_offline_authority_owner;
-- FWD-04C-006
GRANT SELECT(tenant_id,branch_id,catalog_item_id,quantity_on_hand,updated_at)
  ON public.inventory_stock TO afex_offline_authority_owner;

-- FWD-04C-007
CREATE POLICY profiles_offline_function_owner_select
  ON public.profiles FOR SELECT TO afex_function_owner USING(true);
-- FWD-04C-008
CREATE POLICY profiles_offline_authority_owner_select
  ON public.profiles FOR SELECT TO afex_offline_authority_owner USING(true);
-- FWD-04C-009
CREATE POLICY branches_offline_authority_owner_select
  ON public.branches FOR SELECT TO afex_offline_authority_owner USING(true);
-- FWD-04C-010
CREATE POLICY pos_profiles_offline_authority_owner_select
  ON public.pos_profiles FOR SELECT TO afex_offline_authority_owner USING(true);
-- FWD-04C-011
CREATE POLICY inventory_stock_offline_authority_owner_select
  ON public.inventory_stock FOR SELECT TO afex_offline_authority_owner USING(true);

DO $afex$ BEGIN
  IF CURRENT_USER<>'postgres' OR SESSION_USER<>'postgres'
     OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_policies
         WHERE policyname IN (
           'profiles_offline_function_owner_select',
           'profiles_offline_authority_owner_select',
           'branches_offline_authority_owner_select',
           'pos_profiles_offline_authority_owner_select',
           'inventory_stock_offline_authority_owner_select'
         ))<>5 THEN
    RAISE EXCEPTION 'AFEX_WAVE_01F_POST_ATTESTATION_FAILED';
  END IF;
  RAISE NOTICE 'AFEX_WAVE_01F_POSTGRES_CONTEXT_PRESERVED';
END $afex$;
COMMIT;
