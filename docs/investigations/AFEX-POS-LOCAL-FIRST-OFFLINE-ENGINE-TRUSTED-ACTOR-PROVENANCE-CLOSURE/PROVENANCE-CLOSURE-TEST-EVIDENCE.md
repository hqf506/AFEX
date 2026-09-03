# Trusted Actor Provenance Test Evidence

Offline-only focused gates:

- Core V2 Offline bridge: **35/35 PASS**.
- Final SQL/provenance static contract: **14/14 PASS**.
- Account-bootstrap and provisioning authority: **24/24 PASS**.

Coverage proves server JWT verification remains distinct from database session-row revalidation; verified Online bootstrap is required; employee PIN selects an employee only and cannot change scope or unwrap a DEK; logout/restart/recovery remain account-bound; caller UUID equality and service-role transport are never authority; exact Auth/POS/account/bootstrap/tenant/branch/employee/enrollment/device/generation/key/namespace/snapshot/Core mismatches fail closed; the total resolver preserves every server ordinal; payment and inventory validators reject unknown, malformed, duplicate, cross-scope, stale, and provider-authoritative input; complete Offline/Core semantics are equality-bound; and stable receipts revalidate fresh authority before any stored binding or receipt read.

The static suites also prove all four provisioning waves, exact PIN verifier parameters, unique salts, maximum 25 employees, exact `order.create` array, consistent `supabase_admin` installer identity without `SET ROLE`, exact function identities across CREATE/GRANT/REVOKE/disablement, separate NOLOGIN roles, safe JSON conversion, composite constraints, browser/service EXECUTE denial, zero business callers, and complete FWD disposition coverage.

PostgreSQL-compatible parser: `POSTGRESQL_COMPATIBLE_PARSER_UNAVAILABLE`. Database, SQL, Docker, network, Production and business execution: 0.
