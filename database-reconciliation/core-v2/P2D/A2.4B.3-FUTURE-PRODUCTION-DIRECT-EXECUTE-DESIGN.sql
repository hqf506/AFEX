-- A2.4B.3 FUTURE PRODUCTION DESIGN ONLY -- INTENTIONALLY NON-EXECUTABLE
\echo 'STOP: this artifact is architecture review material, not an executable migration.'
\quit 3

-- Future forward unit boundaries:
-- 1. Fail-closed Production identity and installer-authority preflight.
-- 2. Create one finite, NOINHERIT, non-elevated dedicated LOGIN using a secret
--    supplied outside Git; create no membership and transfer no ownership.
-- 3. Revoke every direct/default privilege not explicitly permitted.
-- 4. Grant EXECUTE only on the exact signature:
--    public.acquire_atomic_order_command_v1(
--      uuid, uuid, uuid, text, text, text, text, timestamptz
--    ).
-- 5. Attest the SECURITY DEFINER owner, fixed search_path, source hash,
--    dependencies, RLS/FORCE RLS, exact ACL, zero membership, zero ownership,
--    and denial of table, column, sequence, schema CREATE, helper, overload,
--    unrelated function, PUBLIC, anon, authenticated, and service_role paths.
-- 6. Independently review whether the existing afex_core_runtime EXECUTE grant
--    is preserved or revoked; do not couple that decision to LOGIN creation.
-- 7. Define rollback as exact EXECUTE revocation, LOGIN disablement, session
--    termination/quarantine, credential revocation, and absence attestation.
-- 8. Embed no password, URL, token, provider command, application activation,
--    P2D.20 invocation, dual write, or legacy fallback.
