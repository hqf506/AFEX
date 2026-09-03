# Lock and Performance Contract

## Deterministic acquisition order

1. verify current `auth.sessions` reference and active account;
2. validate the exact POS actor session without a row lock because the function owner has bounded SELECT only;
3. lock only the private mutable device row when the executing owner has update authority;
4. lock only the private mutable employee enrollment/selector row;
5. validate device-bound key-envelope authority without locking read-only support relations;
6. lock the stable account bootstrap and require active status with current generation greater than or equal to the immutable origin generation;
7. verify the trusted snapshot/frontier with equality lookups;
8. call existing Core V2 acquisition, which owns command/idempotency locks;
9. insert or verify the one-to-one provenance companion.

No global counter is introduced. Equality columns precede status/time columns in authority indexes. The resolver performs one set-based call for at most 1,000 claims and the inventory surface handles at most 200 unique item IDs. Receipt lookup performs one fresh resolver call before its bounded ledger join. There is no per-item network round trip and no additional call in the current Online path because activation is false.

Provisioning writers serialize by exact device/employee/snapshot/bootstrap identities and bounded operation IDs. Employee capacity is 25, inventory publication is 1..1000 exact items, acquisition batches are at most 1000, and frontier reads are at most 200 unique items. Review budgets: `lock_timeout=5s`; writer budget `90s` or `120s`; relation-foundation/read-only budget `60s`. Future qualification must capture plans and stop on unbounded scans, nondeterministic lock order, duplicate identity, conflicting replay, or p95 regression. No plan or runtime claim was executed here.
