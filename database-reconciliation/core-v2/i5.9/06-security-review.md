# AFEX Core V2 — Package 6R Security Review

Status: external review required. Core V2 remains disabled and ungranted.

## Repaired package boundaries

- **06A:** seven activation/control functions, seven control tables, five
  indexes, six triggers and fifteen policies. It owns disabled activation
  metadata, evidence, managed identities and issuer rate limiting only.
- **06B:** shared context validator, quote normalization/hash helpers, quote
  mutation guard, authoritative quote issuer, immutability trigger, quote
  insertion policy, quote-context wrapper and final readiness function.
- **06:** historical readiness/static preparation and privilege closure only.
  It does not activate Core V2.

The dependency graph is strictly 06A → 06B → 06. No 06A object depends on 06B.

## Role separation

`afex_core_owner`, `afex_context_issuer`, `afex_outbox_worker`,
`afex_core_activation_owner`, `afex_core_activation_operator` and
`afex_core_runtime` remain NOLOGIN, NOINHERIT and NOBYPASSRLS. Every membership
into these roles is reviewed without filtering the member identity. Generic
`service_role` is not a trusted Core V2 runtime identity.

## Privileged functions

Every SECURITY DEFINER function requires its exact owner,
`search_path=pg_catalog`, schema-qualified references and closed EXECUTE.
Trigger helpers that are SECURITY INVOKER receive no direct runtime grant.
Owners retain implicit execution, so owner compromise remains a critical risk.

## Quote authority and context binding

The authoritative issuer derives price, discount, VAT and totals from trusted
database state. Browser values are never authority. The wrapper delegates to
the shared validator in `non_consuming_quote` mode; issuance binds actor,
tenant, branch, purpose, version and idempotency hash to one immutable quote.

The financial quote FK, unique context index, insert policy and immutable
trigger must remain exact. Replay must never produce a second committed
financial/order identity.

## Readiness and activation

The V2 readiness function is isolated under the activation owner and remains
ungranted. Global enablement, tenant/branch allowlists, feature gates,
deterministic canary percentage and kill switch are server-authoritative.
Installation seeds and preserves a disabled state. Package 6 provides no
activation or runtime permission.

## RLS and ACL boundaries

All seven activation/control tables require RLS and FORCE RLS. Package 6 adds
sixteen policies; the retained Package 5R-B quote-read policy makes seventeen
policies in the complete reviewed Package 6 post-installation surface.
FORCE RLS reduces but does not eliminate owner-bypass risk; SECURITY DEFINER
owners and table ownership must therefore remain separated and reviewed.

Schema CREATE, table privileges, function EXECUTE and default ACLs are separate
review surfaces. Any unexpected owner, grant, membership, overload, policy,
trigger or default privilege is a STOP condition.

## Replay, concurrency and evidence

Residual risks include simultaneous quote issuance/consumption, revocation and
expiry races, activation-state races, rate-limit contention, stale financial
configuration and deterministic-canary drift. These are tested only in an
isolated Clone/Staging environment.

Evidence must exclude raw context tokens, JWTs, PINs, credentials, secrets and
customer data. Retain only sanitized identifiers, hashes that are not usable
as credentials, structured errors and timing evidence.

## Rollback limitation and approval

Automatic rollback cannot reconstruct prior owners, ACLs, default ACLs,
memberships, policies, trigger definitions or activation values. The rollback
guard deliberately fails closed. Only an externally reviewed forward fix or
authoritative restoration may reverse installation.

External approval requires exact hashes, full pre/post outputs, isolated test
evidence and confirmation that Core V2 remains disabled and ungranted.
