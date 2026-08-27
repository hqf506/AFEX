# CA-005 — Serialized review CAS

**Final classification:** `BLOCKED_SQL_DESIGN_REQUIRED`.

Production includes `afex_reconciliation_authority` and Core reconciliation functions for inspect, hold, retry authorization, mark-required, and resolve. These functions are useful current Core incident authority, but the catalog contains no reusable review relation with `review_id`, expected/resulting version, and a unique version-event identity.

The minimum new authority remains:

1. immutable command/tenant/branch binding;
2. one review row with a monotonic version;
3. a unique event on `(review_id,resulting_version)`;
4. one bounded trusted writer;
5. lock order command scope → review row → version event;
6. expected-version compare-and-set;
7. idempotent retry result or explicit conflict classification.

No current function was executed. Concurrency behavior, retry semantics, deadlock order and conflict classification require isolated runtime qualification.

