# Authority resolution

`CoreV2OfflineAuthorityResolver.resolveBatch()` is the only authority dependency. It resolves a bounded batch in one server call contract and must derive:

- primary authenticated actor;
- tenant and branch binding;
- actual POS employee;
- device identity and generation;
- Offline employee enrollment generation;
- command generation;
- employee and device revocation;
- supported command authority;
- trusted inventory frontier;
- Core V2 availability.

The envelope values are never treated as authority. They are claims compared against a `source: trusted_server` snapshot. The returned qualification result does not expose the internal authority snapshot.

Every resolver result is runtime-validated before use: exact available/unavailable keys, positional claim correspondence, UUID identities, positive generations, canonical timestamps, authority version, revocation/Core booleans, unique allowlisted command types and a bounded duplicate-free trusted frontier. Count mismatch, reordering, `undefined`, malformed, duplicated oroversized data becomes deterministic `CORE_V2_OFFLINE_AUTHORITY_UNAVAILABLE`. Parsing is isolated per candidate, so one malformed result cannot invalidate a valid sibling.

A stable receipt does not bypass this gate. Its exact acquisition scope must first match the envelope, and the same immutable actor/tenant/branch/POS employee/device/generations must pass the current trusted snapshot.

The only production-capable resolver shipped by this phase is intentionally unavailable. It returns `CORE_V2_OFFLINE_AUTHORITY_UNAVAILABLE`. No primary-auth-only fallback, service-role shortcut, environment override or direct browser resolver exists.

Database-backed resolution, device/enrollment storage, revocation storage and command-generation authority remain blocked and require the separately reviewed SQL authority phase.
