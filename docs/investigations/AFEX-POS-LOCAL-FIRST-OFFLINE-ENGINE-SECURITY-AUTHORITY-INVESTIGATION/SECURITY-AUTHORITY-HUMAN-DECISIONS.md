# Security Authority Human Decisions

## Already locked

- `MODE_A_MANAGED_PWA_CONTINUOUS_OFFLINE`
- `NO_TIME_BASED_OFFLINE_AUTHORITY_EXPIRY`
- `OPPORTUNISTIC_NOT_MANDATORY`
- `ON_TRUSTED_RECONNECT_OR_AUTHORIZED_LOCAL_LOCK`
- `HUMAN_APPROVED`

Last synchronization age is always visible and never blocks local PIN unlock, reads, switching, or command creation. Remote revocation may remain unknown during an arbitrarily long outage; this Mode A residual risk is accepted. It does not authorize trusting browser identity or bypassing server acquisition.

## Decisions still required before a correction implementation

1. Approve a least-privilege target for legacy table/sequence/schema grants and every direct-client route that will remain supported.
2. Approve removal/replacement of the broad permissive business policies and require a new effective-policy capture.
3. Approve the narrow caller for every legacy `SECURITY DEFINER` function; decide which legacy entry points are retired instead of hardened.
4. Approve whether customer lookup/create remains directly executable by `authenticated` or becomes server-only.
5. Approve a registered-device authority/generation and one-active-device replacement policy.
6. Approve the Offline employee package, PIN/credential/permission generations, roster cap, and immutable command attribution.
7. Approve a dedicated review container versus a versioned Core extension. A dedicated container is the lower coupling option.
8. Approve canonical behavior for `card`, `transfer`, `bank_transfer`, `cod`, and `on_delivery`, plus payment attestation/refund authority.
9. Approve transactional external-effect intent, claim, retry, provider-idempotency, and operator visibility semantics.
10. Resolve Production/repository cancellation-function authority and nonnegative inventory invariants.
11. Approve pilot branch/device, kill-switch ownership, rollback, monitoring, retention, and incident ownership.

## Non-decisions

This package does not select SQL syntax, migration ordering at statement level, a database object shape, or Production rollout. It selects only the proven dependency sequence and the minimum authority outcomes that a later, separately authorized design must satisfy.
