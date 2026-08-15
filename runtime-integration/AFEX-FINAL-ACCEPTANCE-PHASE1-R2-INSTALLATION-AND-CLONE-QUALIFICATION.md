# AFEX Final Acceptance Phase 1-R4C — Installation and Clone Qualification

## Installation preflight

Confirm the official session is a temporary LOGIN with `current_user=session_user`, non-superuser, no CREATEROLE, and exactly the lawful SET-only path to `postgres`. Confirm `postgres` is LOGIN, non-superuser, CREATEROLE, and owns the five accepted Core creator-administration edges through one topology-proven grantor. Confirm none of the target roles, schema, relations, functions, policies, triggers, or indexes exists. The R4C migration must not inspect or require schema `auth`.

## Owner-aware atomic protocol

1. Capture role memberships and ACLs before installation.
2. Begin as the official temporary login, prove its closed topology, and execute `SET LOCAL ROLE postgres`; PostgreSQL must enforce the existing SET edge.
3. Prove the effective `postgres` installer identity and the five Core creator edges, then create owner and maintenance NOLOGIN capabilities. Temporarily grant only the exact SET/CREATE authority required for ownership-sensitive DDL.
4. The owner receives exact source SELECT/UPDATE needed for shared row locks, PIN/digest execution, and private-table access. It has no source-mutating function.
5. `service_role` receives five runtime EXECUTEs; maintenance alone receives cleanup EXECUTE. Temporary CREATE and SET-capable memberships are removed before assertions; the two topology-proven PostgreSQL 17 creator-administration edges remain ADMIN=true/INHERIT=false/SET=false.
6. Remove only temporary edges granted by `postgres`, run post-install assertions, and commit. Transaction completion restores the temporary connection role. Final requirements are dangerousRuntimeMemberships=0, setCapableMemberships=0, unexpectedMemberships=0, and expectedCreatorAdministrationEdges=2.

## Failure injection and rollback

On separate clean clones, reject missing wrapper SET authority, superuser or non-CREATEROLE target, wrong effective role, Core member mismatch, unexpected grantor, and extra SET/INHERIT authority. Inject failures at preflight, post-SET, role creation, schema creation, function creation, and final grants. Every failure must leave zero R4C roles/schema/functions and no temporary membership residue. Reinstallation must fail before mutation.

## Clone matrix

| Gate | Expected |
|---|---|
| Clean installation / transaction rollback | PASS / no residue |
| Direct table access by `PUBLIC`, `anon`, `authenticated`, `service_role` | DENIED |
| Private schema usage by application/browser roles | DENIED |
| Approved function execution by `service_role` | PASS |
| Function execution by browser roles | DENIED |
| Valid PIN issuance and validation | PASS; closed effective context only |
| Invalid PIN, cross-tenant, cross-branch, inactive subject/profile/actor/branch | DENIED |
| Unknown role/reason/hash/session UUID/fingerprint | DENIED |
| Immutable issuance fields / expiry extension / reactivation | DENIED |
| Expiry boundary | `EXPIRED`; no effective context |
| PIN, role, branch, tenant, status change | one-way revocation / fail closed |
| Actor deletion | source deletion succeeds; immutable evidence retained; validation revokes |
| Double revocation | at most one successful transition |
| Concurrent activation for same subject+Auth session ID | one active state; predecessor `SUPERSEDED` |
| PIN reset or actor disable racing with validation | lock/validation yields no stale authority |
| Missing/tampered actor cookie with active Auth-session state | Owner/Admin restoration DENIED |
| Revoked evidence for the same Auth-session ID | restriction remains true; Owner/Admin restoration DENIED |
| Live organization profile missing/disabled/tenant-changed/role-invalid | source locked; authority revoked/fails closed |
| Detailed evidence older than 90 days | bounded cleanup allowed; permanent restriction tombstone retained |
| Auth-session tombstone | one bounded row per subject/session; no elapsed-time deletion |
| Concurrent cleanup and issuance | conflict-updating UPSERT preserves the issued tombstone |
| PIN reset racing issuance | post-lock authoritative verification; old PIN DENIED |
| Actor status/role/branch racing issuance | no stale authority issued |
| Invalid/null revoke token hash | DENIED before mutation |
| Old orphan authority lock older than 90 days | bounded maintenance-only cleanup |
| Lock with retained evidence or age under 90 days | RETAINED |
| Second tab | same restricted authority observed |
| Explicit Admin reauthentication | prior state revoked `ADMIN_REAUTH`; trusted reauth required |
| Admin page and API under Cashier | DENIED |
| Core V2 actor | equals effective server-returned POS actor |
| Raw token/hash/PIN/JWT/PII output | NONE |
| Dangerous runtime memberships after completion | ZERO |
| SET-capable memberships after completion | ZERO |
| Unexpected memberships after completion | ZERO |
| Expected creator-administration edges after completion | EXACTLY TWO |
| Retention cleanup before 90 days | ZERO rows removed |

## Application qualification dependency

Application code now verifies the exact token using `getClaims(accessToken)` and `getUser(accessToken)`, requires matching subjects, derives `session_id` only from signed claims, binds every POS authority RPC through a server-only branded context, and enforces absent-cookie state. Support and Developer paths share the effective POS restriction boundary. The remaining Browser/API/Core matrix must run against the isolated Supabase-compatible clone; Preview remains prohibited.
