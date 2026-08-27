/*
REVIEW-ONLY EMERGENCY MEMBERSHIP RESTORATION. NOT PART OF THE NORMAL FOUNDATION.
This exact-role file changes no object, row, policy, ACL, feature or business state.
It removes only installer-granted temporary memberships and never mutates the
bootstrap-superuser-granted membership rows.
*/
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $afex$ BEGIN
  IF CURRENT_USER <> 'postgres' OR SESSION_USER <> 'postgres'
     OR pg_catalog.current_database() <> 'postgres'
     OR pg_catalog.current_setting('server_version_num') <> '170006'
     OR (SELECT pg_catalog.count(*)
         FROM pg_catalog.pg_auth_members AS m
         JOIN pg_catalog.pg_roles AS granted ON granted.oid=m.roleid
         JOIN pg_catalog.pg_roles AS member_role ON member_role.oid=m.member
         WHERE member_role.rolname='postgres'
           AND granted.rolname IN (
             'afex_context_issuer','afex_core_owner','afex_function_owner',
             'afex_pos_session_owner','afex_offline_authority_owner'
           ) AND m.admin_option) <> 5 THEN
    RAISE EXCEPTION 'AFEX_00Z_INSTALLER_IDENTITY_MISMATCH';
  END IF;
END $afex$;

REVOKE afex_context_issuer FROM postgres GRANTED BY CURRENT_USER;
REVOKE afex_core_owner FROM postgres GRANTED BY CURRENT_USER;
REVOKE afex_function_owner FROM postgres GRANTED BY CURRENT_USER;
REVOKE afex_pos_session_owner FROM postgres GRANTED BY CURRENT_USER;
REVOKE afex_offline_authority_owner FROM postgres GRANTED BY CURRENT_USER;

DO $afex$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_auth_members AS m
    JOIN pg_catalog.pg_roles AS granted ON granted.oid=m.roleid
    JOIN pg_catalog.pg_roles AS member_role ON member_role.oid=m.member
    WHERE member_role.rolname='postgres'
      AND granted.rolname IN (
        'afex_context_issuer','afex_core_owner','afex_function_owner',
        'afex_pos_session_owner','afex_offline_authority_owner'
      ) AND (NOT m.admin_option OR m.inherit_option OR m.set_option)
  ) THEN
    RAISE EXCEPTION 'AFEX_00Z_MEMBERSHIP_RESTORATION_FAILED';
  END IF;
  RAISE NOTICE 'AFEX_00Z_MEMBERSHIP_OPTIONS_RESTORED';
END $afex$;
COMMIT;
