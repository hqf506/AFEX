# Architecture

## Boundary

`lib/offline/core-v2-offline-authority-bridge.ts` is marked `server-only`, following the bundled Next.js 16.2.10 data-security guidance. It exposes contracts and deterministic pure qualification functions. It imports no browser, database, Supabase, route, service-role or current business-write module.

No API route or Server Action was necessary. Therefore the phase has no remotely callable surface and no hidden route activation path.

## Flow

1. Strictly parse the exact envelope and its command-specific payload; reject unknown fields, cross-command shapes and invalid command/aggregate bindings.
2. Normalize bounded command semantics, including deterministic order items, money totals, inventory item set and payment-attestation identity, then verify the canonical SHA-256.
3. Parse the complete immutable idempotency acquisition scope and classify conflicts or a candidate stable receipt.
4. Verify dependencies for first-acquisition candidates.
5. Resolve all surviving authority claims through one trusted server batch resolver call.
6. Runtime-parse each positional resolution and trusted snapshot. A malformed candidate is normalized to `CORE_V2_OFFLINE_AUTHORITY_UNAVAILABLE` without corrupting valid siblings.
7. Compare every browser/acquisition claim with the trusted actor, tenant, branch, POS employee, device and generation snapshot. Stable receipts are exposed only after this binding passes.
8. Verify revocation, command authority, inventory frontier, payment attestation, conflicts and Core availability in fixed order.
9. Return a bounded qualification result only. No mutation follows.

The production resolver is deliberately unavailable and returns `CORE_V2_OFFLINE_AUTHORITY_UNAVAILABLE`. Browser values remain claims only. A future database-backed resolver is required before genuine qualification can be used by a replay service.

## Delivery guarantee

The contract states only: `at-least-once transport with idempotent server acquisition and stable receipt replay`.

It does not claim exactly-once delivery.
