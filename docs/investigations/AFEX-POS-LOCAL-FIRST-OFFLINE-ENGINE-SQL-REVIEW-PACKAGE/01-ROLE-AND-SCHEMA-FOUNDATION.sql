/*
classification: BLOCKED_INSUFFICIENT_EVIDENCE
wave: foundation-draft; Wave 1 is not authorized
purpose: Create only isolated new AFEX roles and schemas while leaving every historical privilege mutation blocked behind caller compatibility.
execution status: NOT AUTHORIZED
prerequisites: 00 preflight MATCH for evidence-proven existing-role attributes; independent review; proposed schemas absent; no unexpected role membership.
expected owner/operator: postgres or separately approved migration principal with CREATEROLE and schema ownership authority.
transaction behavior: One transaction for new objects only; the blocked public-schema ACL mutation is not executable.
lock risk: Role and new-schema catalog locks; no business-table or existing-schema ACL mutation.
retry behavior: Stop on identity, membership or proposed-schema existence mismatch; retry only after a new reviewed package.
rollback reference: SQL-REVIEW-ROLLBACK-CONTRACT.md section Foundation.
required evidence before execution: Exact pg_roles and memberships; existing-role attributes proven by evidence; proposed schema absence; Prompt 9 caller proof for every existing-object ACL change.
*/

-- block: CANDIDATE_NEW_OBJECT_DDL / evidence-proven guards and proposed roles
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('afex_offline_authority_review_package_v1', 0));

DO $afex_roles$
DECLARE
    role_name pg_catalog.name;
    evidence_proven_existing pg_catalog.name[] := ARRAY[
        'afex_core_owner','afex_function_owner','afex_pos_session_owner',
        'afex_core_runtime','afex_pos_session_maintenance','afex_reconciliation_authority'
    ]::pg_catalog.name[];
    proposed pg_catalog.name[] := ARRAY[
        'afex_identity_owner','afex_business_owner','afex_inventory_owner','afex_audit_owner',
        'afex_offline_authority_owner','afex_review_owner','afex_effect_owner',
        'afex_offline_enrollment_runtime','afex_offline_acquisition_runtime',
        'afex_business_review_runtime','afex_effect_dispatcher','afex_inventory_admin_runtime'
    ]::pg_catalog.name[];
BEGIN
    FOREACH role_name IN ARRAY evidence_proven_existing LOOP
        IF NOT EXISTS (
            SELECT 1
            FROM pg_catalog.pg_roles AS r
            WHERE r.rolname = role_name
              AND NOT r.rolcanlogin
              AND NOT r.rolsuper
              AND NOT r.rolbypassrls
              AND NOT r.rolcreatedb
              AND NOT r.rolcreaterole
              AND NOT r.rolreplication
        ) THEN
            RAISE EXCEPTION 'AFEX_ROLE_IDENTITY_MISMATCH: proven attributes differ for %', role_name;
        END IF;
        -- rolinherit is intentionally captured by file 00 but not asserted here:
        -- the approved evidence does not freeze it for these six existing roles.
    END LOOP;

    FOREACH role_name IN ARRAY proposed LOOP
        IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles AS r WHERE r.rolname = role_name) THEN
            IF EXISTS (
                SELECT 1
                FROM pg_catalog.pg_roles AS r
                WHERE r.rolname = role_name
                  AND (r.rolcanlogin OR r.rolsuper OR r.rolbypassrls OR r.rolcreatedb
                       OR r.rolcreaterole OR r.rolreplication OR r.rolinherit)
            ) OR EXISTS (
                SELECT 1
                FROM pg_catalog.pg_auth_members AS m
                JOIN pg_catalog.pg_roles AS member_role ON member_role.oid = m.member
                JOIN pg_catalog.pg_roles AS granted_role ON granted_role.oid = m.roleid
                WHERE member_role.rolname = role_name OR granted_role.rolname = role_name
            ) THEN
                RAISE EXCEPTION 'AFEX_ROLE_IDENTITY_MISMATCH: conflicting proposed role %', role_name;
            END IF;
        ELSE
            EXECUTE pg_catalog.format(
                'CREATE ROLE %I NOLOGIN NOSUPERUSER NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
                role_name
            );
        END IF;
    END LOOP;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_auth_members AS m
        JOIN pg_catalog.pg_roles AS member_role ON member_role.oid = m.member
        JOIN pg_catalog.pg_roles AS granted_role ON granted_role.oid = m.roleid
        WHERE member_role.rolname = ANY (ARRAY['anon','authenticated','service_role']::pg_catalog.name[])
          AND granted_role.rolname LIKE 'afex\_%' ESCAPE '\'
    ) THEN
        RAISE EXCEPTION 'AFEX_ROLE_MEMBERSHIP_MISMATCH: browser or gateway inherits AFEX authority';
    END IF;
END
$afex_roles$;

-- block: CANDIDATE_NEW_OBJECT_DDL / new private schemas and new-object ACLs only
DO $afex_schema_gate$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_namespace AS n
        JOIN pg_catalog.pg_roles AS r ON r.oid = n.nspowner
        WHERE n.nspname = 'afex_core_private' AND r.rolname = 'afex_function_owner'
    ) OR NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_namespace AS n
        JOIN pg_catalog.pg_roles AS r ON r.oid = n.nspowner
        WHERE n.nspname = 'afex_pos_authority' AND r.rolname = 'afex_pos_session_owner'
    ) THEN
        RAISE EXCEPTION 'AFEX_SCHEMA_IDENTITY_MISMATCH: existing private schema';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.pg_namespace AS n
        WHERE n.nspname = ANY (ARRAY[
            'afex_offline_authority','afex_review_private','afex_effect_private'
        ]::pg_catalog.name[])
    ) THEN
        RAISE EXCEPTION 'AFEX_PROPOSED_SCHEMA_ALREADY_EXISTS_REVIEW_REQUIRED';
    END IF;
END
$afex_schema_gate$;

CREATE SCHEMA afex_offline_authority AUTHORIZATION afex_offline_authority_owner;
CREATE SCHEMA afex_review_private AUTHORIZATION afex_review_owner;
CREATE SCHEMA afex_effect_private AUTHORIZATION afex_effect_owner;

REVOKE ALL ON SCHEMA afex_offline_authority FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SCHEMA afex_review_private FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON SCHEMA afex_effect_private FROM PUBLIC, anon, authenticated, service_role;

GRANT USAGE ON SCHEMA afex_offline_authority TO afex_offline_authority_owner;
GRANT USAGE ON SCHEMA afex_review_private TO afex_review_owner;
GRANT USAGE ON SCHEMA afex_effect_private TO afex_effect_owner;

COMMIT;

-- block: BLOCKED_INSUFFICIENT_EVIDENCE / existing public-schema ACL closure
-- REVOKE CREATE ON SCHEMA public is intentionally absent. Prompt 9 must prove
-- that Supabase, migration, extension, maintenance and application callers do
-- not depend on each current grant. Wave 1 stops before the first existing-
-- object privilege mutation when that caller evidence is incomplete.
