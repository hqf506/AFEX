/*
REVIEW-ONLY INACTIVE FORWARD SQL. NOT AUTHORIZED FOR EXECUTION.
Wave 1B: postgres-owned public composite scope constraints only.
*/
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $afex$ BEGIN
  IF CURRENT_USER <> 'postgres' OR SESSION_USER <> 'postgres'
     OR pg_catalog.current_database() <> 'postgres'
     OR pg_catalog.current_setting('server_version_num') <> '170006'
     OR (SELECT pg_catalog.count(*) FROM public.branches WHERE tenant_id IS NULL) <> 0
     OR (SELECT pg_catalog.count(*) FROM public.catalog_items WHERE tenant_id IS NULL) <> 0
     OR EXISTS (
       SELECT 1 FROM public.branches GROUP BY id,tenant_id HAVING pg_catalog.count(*)>1
     ) OR EXISTS (
       SELECT 1 FROM public.catalog_items GROUP BY id,tenant_id HAVING pg_catalog.count(*)>1
     ) THEN
    RAISE EXCEPTION 'AFEX_WAVE_01B_PRECONDITION_FAILED';
  END IF;
END $afex$;

-- FWD-01B-001
ALTER TABLE public.branches
  ADD CONSTRAINT afex_branches_id_tenant_scope_uk UNIQUE (id,tenant_id);
-- FWD-01B-002
ALTER TABLE public.catalog_items
  ADD CONSTRAINT afex_catalog_items_id_tenant_scope_uk UNIQUE (id,tenant_id);

-- FWD-01B-003
GRANT REFERENCES (id) ON public.tenants TO afex_offline_authority_owner;
-- FWD-01B-004
GRANT REFERENCES (id,tenant_id) ON public.branches TO afex_offline_authority_owner;
-- FWD-01B-005
GRANT REFERENCES (id) ON public.profiles TO afex_offline_authority_owner;
-- FWD-01B-006
GRANT REFERENCES (id,tenant_id) ON public.catalog_items TO afex_offline_authority_owner;

DO $afex$ BEGIN
  IF CURRENT_USER <> 'postgres' OR SESSION_USER <> 'postgres'
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_constraint
       WHERE conrelid='public.branches'::pg_catalog.regclass
         AND conname='afex_branches_id_tenant_scope_uk'
     ) OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_constraint
       WHERE conrelid='public.catalog_items'::pg_catalog.regclass
         AND conname='afex_catalog_items_id_tenant_scope_uk'
     ) THEN
    RAISE EXCEPTION 'AFEX_WAVE_01B_POST_ATTESTATION_FAILED';
  END IF;
  RAISE NOTICE 'AFEX_WAVE_01B_POSTGRES_CONTEXT_PRESERVED';
END $afex$;
COMMIT;
