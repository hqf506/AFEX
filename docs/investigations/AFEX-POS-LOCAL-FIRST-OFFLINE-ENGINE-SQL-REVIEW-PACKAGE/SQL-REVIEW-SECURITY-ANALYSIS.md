# SQL Review Security Analysis — Scope Integrity Correction

## Authority boundary

RLS is row authorization, not column secrecy. Browser roles retain no direct profile or inventory-history access, and `service_role` is not treated as authorization. Every future trusted writer must derive tenant, branch, actor, device and generation values from trusted server authority and bind them declaratively where durable rows repeat those values.

## Composite integrity correction

The previous single-column references were insufficient. A parent command/device/employee/snapshot identifier cannot validate separately supplied tenant, branch, employee, subject or generation columns. Files `05`–`08` now emit no relation DDL because the following foreign-key targets are not frozen:

- branch plus tenant authority (CA-001);
- full employee/device/subject/scope/generation authority (CA-002);
- Core command plus tenant/branch scope (CA-003);
- snapshot header plus tenant/branch scope (CA-004).

Trigger immutability and server validation do not substitute for INSERT-time composite foreign-key closure. No cross-tenant, cross-branch, cross-device, cross-employee or cross-command mismatch remains representable in a block classified as a candidate.

## Roles and historical ACLs

Existing AFEX roles are checked only for evidence-proven false attributes: LOGIN, SUPERUSER, BYPASSRLS, CREATEDB, CREATEROLE and REPLICATION. `rolinherit` is informational until exact evidence is approved. Proposed new roles still require the full NOLOGIN/NOSUPERUSER/NOINHERIT/NOCREATEDB/NOCREATEROLE/NOREPLICATION/NOBYPASSRLS contract.

No executable statement revokes CREATE from `public`. Every historical ACL, default privilege, policy, function and index/constraint mutation remains behind Prompt 9 caller compatibility. Isolated new-schema ACLs do not authorize historical privilege changes.

## Review, payment and effect separation

- Review events require a trusted serialized compare-and-set writer; a version arithmetic CHECK and unique event version are insufficient.
- Every employee payment writer must force `employee_attested` plus `unverified` for all eight distinct payment methods. Provider confirmed/rejected/ambiguous transitions require a separate future provider writer and exact grants.
- Effect replay safety is not claimed. Claim shape, positive claim version, success/terminal timestamps, retry shape, attempt behavior, provider result and atomic Core intent insertion remain blocked.
- WhatsApp, print, notification and audit-export dispatch are absent.

## Secret and privacy boundary

No SQL contains customer rows, PII examples, plaintext/reversible PIN, server PIN verifier, private key, DEK, service credential, connection string, provider secret, PAN, CVV, payment PIN, track data or reusable provider token. The eight payment methods remain distinct and no provider state can be written because the relation/writers are blocked.

## Decision

No SQL may be executed on the strength of this package. Prompt 9 and Phase 5 were not started.
