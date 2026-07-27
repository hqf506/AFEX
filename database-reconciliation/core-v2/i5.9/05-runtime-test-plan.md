# AFEX Core V2 — Package 5R-B Runtime Test Plan

Status: NOT EXECUTED  
Environment: isolated Clone/Staging only  
Production: prohibited

## Scenarios

1. Browser, anon, authenticated, and service-role direct runtime calls fail.
2. Atomic entry remains unavailable before activation.
3. Approved server identity issues JWT and POS contexts.
4. Invalid profile, tenant, branch, role, employee, PIN, purpose, version,
   expiry, or key hash fails.
5. Valid context is consumed once inside a rolled-back and committed test.
6. Revocation prevents later consumption.
7. Worker claims, completes, and fails isolated outbox fixtures.
8. Worker cannot read tables directly or call the atomic engine.
9. Cross-tenant/branch attempts fail without data exposure.

## Evidence and success

Retain sanitized correlation IDs, status/error categories, role identity,
before/after counts, lease state, and ACL results. Never retain raw context
tokens, PINs, keys, credentials, customer data, or payload secrets.

All expected successes and failures must match the reviewed contract. Core V2
remains disabled. Completion does not authorize Production use.

## STOP conditions

Production endpoint, privilege bypass, cross-scope access, token disclosure,
partial state, unexpected grant, or any need to edit approved SQL.

