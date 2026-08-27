# Pilot Contract Test Evidence

Offline-only focused gates:

- Core V2 Offline bridge: **35/35 PASS**.
- Final SQL/provenance static contract: **14/14 PASS**.
- Account-bootstrap and provisioning authority: **24/24 PASS**.
- Trusted-actor provenance suite: reported separately in the Provenance package.

The focused coverage includes exact envelope rejection, deterministic canonical hashing, all 22 authority-binding inputs, the exact 15-field account/bootstrap/employee/device origin, all eight payment methods independently, unknown/sensitive/provider-authoritative payment denial, exact inventory publication/replay, durable commitment reconstruction, Online bootstrap prerequisite, PIN-only employee selection, verifier parameters, 25-employee limit, logout/restart/same-account recovery/cross-scope denial, stale/revoked generation failures, idempotency conflicts, stable authority-bound receipts, malformed resolver isolation, exact batch count/order, 1,000-command bound, seven Shadow command denials, immutable false flags, zero callers, whole-file wave identity, separate NOLOGIN roles, composite scopes, exact grants/revokes/signatures, and forward/disposition completeness.

PostgreSQL-compatible parser: `POSTGRESQL_COMPATIBLE_PARSER_UNAVAILABLE`. No PostgreSQL parser PASS or database test is claimed. SQL/DB/network/Production/provider/business execution: 0.
