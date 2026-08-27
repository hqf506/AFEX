# Authority Correction Design Baseline

## Gate identity

- Repository: `C:/Users/NSC-LUA/Desktop/leather-fix-erp-pos-responsive`
- Branch: `codex/pos-responsive-redesign`
- Baseline HEAD: `37331390ec00bee507f88701365bfebb944db675`
- Upstream ahead/behind at gate: `0/0`
- Staged paths at gate: `0`
- Existing tracked application changes: 12 paths; binary diff identity `f2cc98137dc505b495da608ec5ba38d3c0293670`.
- Approved Phase 1–3 source identities: 18/18 matched.
- Approved manifests: full investigation, Phases 0–4, Production read-only attestation, and Security Authority Investigation all passed content and coverage verification.
- R8N entries were counted from `git status` only and were not opened, hashed, archived, or modified.

## Approved inputs

This design inherits the human-approved Local-First investigation, Phases 0–4, the Production read-only attestation as evidence only, and the independent Security Authority Investigation. The locked policy is:

- `MODE_A_MANAGED_PWA_CONTINUOUS_OFFLINE`
- `NO_TIME_BASED_OFFLINE_AUTHORITY_EXPIRY`
- `OPPORTUNISTIC_NOT_MANDATORY`
- `ON_TRUSTED_RECONNECT_OR_AUTHORIZED_LOCAL_LOCK`
- `HUMAN_APPROVED`

One managed Offline-authorized device is permitted per `(tenant, branch)`. Previously enrolled, locally intact employees may authenticate and switch Offline. Synchronization age is visible but never an authorization cutoff.

## Proven authority starting point

The modern Core V2 and POS actor domains use dedicated non-login owners, narrow function entry points, forced RLS, immutable command identity, stable receipts, and server-only execution. Those boundaries are preserved.

The legacy public business domain is not an acceptable Offline authority foundation. Broad object/default ACLs, permissive policies and broadly executable owner functions combine to expose cross-tenant or privileged paths. Application filters cannot compensate for direct Data API or privileged-function reachability.

No registered device authority, Offline employee generation authority, persistent unwrap server metadata, business review container, complete payment attestation, inventory snapshot frontier, or transactional external-effect ledger currently exists.

## Design-only boundary

This package contains object dispositions, structured predicates, ownership and caller contracts, migration-wave dependencies, tests, performance budgets, and rollout rules. It contains no executable SQL, migration, application/Core implementation, deployment, database connection, or Production action. Every future database correction requires a separate human-approved SQL design and post-change read-only attestation.

Phase 5, persistent unwrap, durable outbox, dispatch/replay and pilot flags remain disabled.
