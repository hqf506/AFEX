# Review container

The review contract preserves:

- immutable local command, idempotency and payload-hash identity;
- reason code;
- bounded authority snapshot identity;
- conflict snapshot;
- pending/accepted/rejected reviewer state;
- integer compare-and-set version;
- reviewer, timestamp and resolution code.

Resolution requires the current state to be pending and the supplied version to equal the stored compare-and-set version. A stale or repeated resolution returns `REVIEW_CAS_CONFLICT`.

This is an application contract only. No table, SQL, reviewer route or persistent mutation exists.
