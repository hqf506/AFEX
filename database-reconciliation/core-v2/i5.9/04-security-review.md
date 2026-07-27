# AFEX Core V2 — Package 4T Security Review

Status: external review required  
SQL state: not executed by this completion task  
Core V2 state: disabled

## Security boundary

Package 4T is a service-only atomic engine. It does not authorize browser,
anonymous, authenticated, service-role, worker, issuer, runtime, or activation
roles to execute its entry point.

Authorization is represented by an opaque, single-use context token. The atomic
entry point consumes and revalidates that context through the approved shared
authorization validator.

## Function security inventory

- Mutating and privileged readers use `SECURITY DEFINER`.
- Pure canonical builders use `SECURITY INVOKER`.
- Every Package 4 function sets `search_path = pg_catalog`.
- Referenced application objects are explicitly schema-qualified.
- Package 4 revokes execution from all reviewed browser and runtime roles.
- Package 4 grants no execution privilege.
- Package 5 owns final ownership and security policy.
- Package 6 owns any eventual entry-point grant and activation gate.

## Authorization checks

The reviewed contract binds:

- tenant;
- branch;
- authenticated profile;
- effective role;
- POS employee where applicable;
- idempotency key hash;
- correlation ID;
- context expiry and single-use state.

Current profile, tenant, branch, role, and POS binding must remain valid at
consumption time.

## Tenant and branch isolation

Customer, quote, pricing, inventory, numbering, order, invoice, audit,
idempotency, and outbox operations carry trusted tenant and branch scope.
Browser input is not trusted to establish those identities.

## Input and replay controls

- JSON object shape and allowed keys are checked.
- Payload and item-count limits are enforced.
- Customer phone identity is normalized.
- Idempotency key and request fingerprint are validated.
- Quote context, expiry, fingerprint, payload hash, and snapshot parity are
  checked.
- Committed replay remains scope-, actor-, engine-, and fingerprint-bound.

## SQL injection and search-path review

- No dynamic SQL is used for application-provided identifiers.
- No caller-controlled relation or function name is executed.
- Safe `pg_catalog` search path is explicit.
- Public objects are explicitly qualified.

## Privilege assertions

External review must prove:

1. No unexpected function overload exists.
2. Function owners match Package 5R-B.
3. `PUBLIC`, `anon`, `authenticated`, and `service_role` lack EXECUTE.
4. `afex_core_runtime` lacks EXECUTE before approved activation.
5. Issuer and outbox-worker roles cannot invoke the atomic entry point.
6. No helper is browser-callable.
7. Core V2 flags remain disabled.

## Data exposure

Errors use stable categories and must not expose SQL text, credentials, raw
authorization tokens, raw idempotency keys, or unrelated tenant data. Runtime
logs must retain correlation and sanitized error data only.

## Residual risks

- `SECURITY DEFINER` makes owner correctness and ACL closure mandatory.
- Package 4 depends on Package 5R-B and Package 6B contracts.
- Removing the legacy outbox overload is not automatically reversible.
- Runtime correctness, race behavior, and isolation remain unproven until the
  isolated plans pass.
- Any later grant or activation can invalidate this review and requires a new
  security checkpoint.

## Decision gate

Package 4 is not activation-ready until:

- pre/post verification passes;
- Package 5 ownership and ACL review passes;
- Package 6 activation remains externally gated;
- runtime, concurrency, replay, inventory, and financial tests pass in an
  isolated environment;
- Package 7 evidence is accepted.

