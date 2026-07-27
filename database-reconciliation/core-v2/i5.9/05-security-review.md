# AFEX Core V2 — Package 5R-B Security Review

Status: external review required  
Core V2: disabled  
Runtime tests: NOT EXECUTED

## Role attributes

`afex_core_owner`, `afex_context_issuer`, and `afex_outbox_worker` must remain
NOLOGIN, NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOINHERIT, NOREPLICATION, and
NOBYPASSRLS. Unsafe membership into any dedicated role is prohibited.

## SECURITY DEFINER and ownership

All privileged Package 4T functions are owned by `afex_core_owner`. Context
issuance/revocation functions are owned by `afex_context_issuer`. Consumer and
worker functions are owned by `afex_core_owner`. Every SECURITY DEFINER
function uses `search_path=pg_catalog` and schema-qualified application objects.

## Schema and default privileges

Browser/service roles cannot CREATE in `public`. Dedicated roles receive only
required schema USAGE. Default function/table/sequence privileges for the two
creating owners close PUBLIC exposure.

## Table privileges

`afex_core_owner` receives only transaction-engine reads and writes.
`afex_context_issuer` receives context insert/update/read plus profile/tenant/
branch/POS reads. `afex_outbox_worker` receives no direct table grant.

## RLS policies

RLS is enabled on authorization contexts, financial quotes, idempotency
commands, and atomic outbox. Seven policies isolate issuer, core owner, quote,
idempotency, and outbox access. Exact command, role, USING, and CHECK
expressions require external comparison with `05-security.sql`.

## Authorization context

Issuance binds current authenticated profile, tenant, branch, role, employee
where applicable, idempotency-key hash, purpose, version, expiry, and a hashed
opaque token. Consumption delegates to the shared Package 6B validator in
consuming mode. Raw tokens must never be retained in evidence or logs.

## Outbox worker isolation

The worker receives EXECUTE only on claim, complete, and fail functions.
Leases bind ownership and expiry. It receives no atomic-order execution and no
direct outbox-table grant.

## Browser and service-role closure

PUBLIC, anon, authenticated, and service_role must have no Package 4T/5R-B
runtime-helper execution and no internal-table access. `create_order_atomic_v2`
remains ungranted.

## Dependency ordering

Package 2B-S security objects, Package 4T exact functions, and Package 6B shared
validator must exist before 5R-B. Package 6 activation and Package 7 testing
remain later, externally gated phases.

## Residual risks

- SECURITY DEFINER correctness depends on exact owner and search path.
- Owners retain implicit execution even after ACL revocation.
- Default ACL verification depends on the actual creating role.
- RLS owners may bypass RLS unless later architecture explicitly forces it.
- Authorization and worker concurrency remain unproven until isolated tests.
- Rollback cannot safely reconstruct unknown prior ACL/policy/owner state.

## Review decision

Do not approve unless pre/post SQL, role/ACL plan, isolated runtime,
authorization replay, concurrency, and worker-race evidence all pass while Core
V2 remains disabled.

