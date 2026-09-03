# Application compatibility closure architecture

## Boundaries

The implementation adds four bounded layers without enabling Offline transactions:

1. A trusted server presentation serializer at `GET /api/account/profile-presentation`.
2. One in-memory, deduplicated client provider keyed by the complete presentation authority scope.
3. A dedicated cursor-based inventory-history v2 route behind a disabled server flag, isolated from the legacy route.
4. Pure local sync/inventory presentation contracts with all sensitive and transactional flags disabled.

Authorization remains in `lib/authorization-context.ts`, `lib/api-auth.ts`, and the existing internal auth state. The seven presentation fields never authorize a route, choose a tenant, or select a branch.

## Request topology

- Profile: authenticated browser -> immutable primary-profile/tenant/branch/POS-session scope -> trusted Route Handler -> verified authorization context -> tenant/branch display reads constrained by trusted IDs -> exact seven-key serializer. POS actor lifecycle events synchronously abort and clear the previous in-memory request before the next scope loads.
- Inventory v2: authenticated admin browser -> dedicated `/api/admin/inventory-movements/v2` Route Handler -> verified tenant/branch access -> scope-bound cursor -> bounded view query ordered by `created_at DESC, id DESC` -> at most two parallel enrichment queries. The legacy page-number route and caller remain unchanged.
- Sync status: browser connectivity events plus locally authorized Phase 3 metadata counters. No polling, payload read, network request, or dispatch.
- Local inventory: pure O(n) projection over a trusted snapshot and reconstructed `order.create` commitments in `pending`/`syncing` states. It is not connected to the sale enforcement path.

## Disabled-by-default rollout

Presentation caller migration, inventory v2, and sync UI require explicit build-time flags. Local inventory enforcement, sensitive cache ingestion, persistent unwrap, Production outbox persistence, dispatch, replay, Offline order interception/creation, provider actions, and external effects are hard-disabled.

The authenticated profile route itself is available for controlled compatibility testing, as required. Route availability grants no authority and exposes only its exact allowlist.
