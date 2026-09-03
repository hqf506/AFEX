/*
REVIEW-ONLY INACTIVE FORWARD SQL. NOT AUTHORIZED FOR EXECUTION.
Wave 1C: exact Core-owner composite constraints with bounded PostgreSQL 17
membership-option elevation. Existing Core object ownership is unchanged.
*/
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

DO $afex$ BEGIN
  IF CURRENT_USER <> 'postgres' OR SESSION_USER <> 'postgres'
     OR pg_catalog.current_database() <> 'postgres'
     OR pg_catalog.current_setting('server_version_num') <> '170006'
     OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_auth_members AS m
       JOIN pg_catalog.pg_roles AS granted ON granted.oid=m.roleid
       JOIN pg_catalog.pg_roles AS member_role ON member_role.oid=m.member
       WHERE granted.rolname='afex_core_owner' AND member_role.rolname='postgres'
         AND m.admin_option AND NOT m.inherit_option AND NOT m.set_option
     ) OR (SELECT pg_catalog.count(*) FROM public.atomic_authorization_contexts
           WHERE tenant_id IS NULL OR branch_id IS NULL OR authenticated_actor_id IS NULL) <> 0
     OR EXISTS (
       SELECT 1 FROM public.atomic_order_commands AS c
       LEFT JOIN public.atomic_authorization_contexts AS a
         ON a.id=c.authorization_context_id
        AND a.authenticated_actor_id=c.authenticated_actor_id
        AND a.tenant_id=c.tenant_id AND a.branch_id=c.branch_id
       WHERE a.id IS NULL
     ) THEN
    RAISE EXCEPTION 'AFEX_WAVE_01C_PRECONDITION_FAILED';
  END IF;
END $afex$;

GRANT afex_core_owner TO postgres
  WITH ADMIN FALSE, INHERIT FALSE, SET TRUE
  GRANTED BY CURRENT_USER;
DO $afex$ BEGIN
  IF NOT pg_catalog.pg_has_role('postgres','afex_core_owner','SET') THEN
    RAISE EXCEPTION 'AFEX_WAVE_01C_TEMPORARY_SET_ENABLE_FAILED';
  END IF;
END $afex$;
SET LOCAL ROLE afex_core_owner;
DO $afex$ BEGIN
  IF CURRENT_USER <> 'afex_core_owner' OR SESSION_USER <> 'postgres' THEN
    RAISE EXCEPTION 'AFEX_WAVE_01C_OWNER_CONTEXT_MISMATCH';
  END IF;
END $afex$;

-- FWD-01C-001
ALTER TABLE public.atomic_authorization_contexts
  ADD CONSTRAINT afex_atomic_context_offline_scope_uk UNIQUE
    (id,authenticated_actor_id,tenant_id,branch_id,employee_source_id);
-- FWD-01C-002
ALTER TABLE public.atomic_order_commands
  ADD CONSTRAINT afex_atomic_command_offline_scope_uk UNIQUE
    (id,authorization_context_id,authenticated_actor_id,tenant_id,branch_id);
-- FWD-01C-003
GRANT REFERENCES (id,authenticated_actor_id,tenant_id,branch_id,employee_source_id)
  ON public.atomic_authorization_contexts TO afex_offline_authority_owner;
-- FWD-01C-004
GRANT REFERENCES (id,authorization_context_id,authenticated_actor_id,tenant_id,branch_id)
  ON public.atomic_order_commands TO afex_offline_authority_owner;

RESET ROLE;
REVOKE afex_core_owner FROM postgres GRANTED BY CURRENT_USER;
DO $afex$ BEGIN
  IF CURRENT_USER <> 'postgres' OR SESSION_USER <> 'postgres'
     OR EXISTS (
       SELECT 1 FROM pg_catalog.pg_auth_members AS m
       JOIN pg_catalog.pg_roles AS granted ON granted.oid=m.roleid
       JOIN pg_catalog.pg_roles AS member_role ON member_role.oid=m.member
       WHERE granted.rolname='afex_core_owner' AND member_role.rolname='postgres'
         AND (NOT m.admin_option OR m.inherit_option OR m.set_option)
     ) OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_constraint
       WHERE conrelid='public.atomic_authorization_contexts'::pg_catalog.regclass
         AND conname='afex_atomic_context_offline_scope_uk'
     ) OR NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_constraint
       WHERE conrelid='public.atomic_order_commands'::pg_catalog.regclass
         AND conname='afex_atomic_command_offline_scope_uk'
     ) THEN
    RAISE EXCEPTION 'AFEX_WAVE_01C_POST_ATTESTATION_FAILED';
  END IF;
  RAISE NOTICE 'AFEX_WAVE_01C_OWNER_CONTEXT_RESTORED';
END $afex$;
COMMIT;
