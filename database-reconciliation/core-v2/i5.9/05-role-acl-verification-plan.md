# AFEX Core V2 — Package 5R-B Role and ACL Verification Plan

Status: NOT EXECUTED  
Environment: isolated Clone/Staging before Production review

## Verification matrix

1. Exact attributes for the three dedicated roles.
2. No unsafe memberships or admin options.
3. Exact owners for all 24 Package 4T/5R-B functions.
4. SECURITY DEFINER and `search_path=pg_catalog` parity.
5. Full effective EXECUTE matrix for nine reviewed roles.
6. Atomic entry closed before activation.
7. Issuer limited to three owned context functions.
8. Worker limited to three approved worker functions.
9. Browser/service roles closed from runtime helpers and internal tables.
10. Schema CREATE closed.
11. Exact core-owner and issuer table grants.
12. Four internal tables have RLS.
13. Seven exact policies, with commands, roles, USING, and CHECK.
14. No unexpected policies or overloads.
15. Default function/table/sequence ACLs contain no PUBLIC grants for dedicated
    creating roles.
16. Core V2 activation controls remain disabled.

## Evidence

Use `05-post-run-verification.sql`, retain the complete result, and independently
compare it to `05-security.sql`. Any REVIEW, missing role, unexpected owner,
grant, policy, overload, membership, or default ACL is a STOP condition.

