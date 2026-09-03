# Risks and rollback

## Remaining blockers

1. No database-backed authority resolver exists.
2. Device, enrollment, revocation and command-generation authority require reviewed persistence.
3. Trusted inventory frontier ingestion and persistence require reviewed SQL authority.
4. Stable server acquisition and receipt persistence require reviewed Core V2 database contracts.
5. Review containers and external-effect ledgers have no persistence.
6. Cancellation, refund and stock restoration lack exact atomic authority.

## Safety controls

- server-only module;
- no route or caller integration;
- exact unknown-field rejection;
- exact runtime payload schemas and command/aggregate/frontier/payment binding;
- authority-bound acquisition and receipt identity;
- exact count-correspondent resolver parsing with per-candidate fail-closed isolation;
- hard-coded false flags with no environment overrides;
- unavailable production resolver;
- one bounded resolver call per batch;
- no fetch, RPC, Supabase, service role, timer or Service Worker path;
- no SQL or migration.

## Rollback

Remove the new module, focused test and this evidence directory. No database rollback, data cleanup, route rollback or state migration is required because the phase created no runtime integration or persistence.
